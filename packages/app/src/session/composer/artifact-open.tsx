import type { SessionMessageInfo } from "@opencode/client/promise"
import { Schema } from "effect"
import { createEffect, on } from "solid-js"
import { useExtensionHost } from "@/runtime/extension/host"
import { useExtensionAttachment } from "@/runtime/extension/host-apis"
import { useData } from "@/runtime/server/current"
import { clearPendingArtifact, pendingArtifact } from "@/artifacts/pending"

const isArtifactMetadata = Schema.is(Schema.Struct({ path: Schema.String }))

/** Paths of `artifact` tool calls that completed at or after `since`, oldest first. */
export function newArtifacts(messages: readonly SessionMessageInfo[], since: number) {
  return messages.flatMap((message) =>
    message.type !== "assistant"
      ? []
      : message.content.flatMap((content) => {
          if (content.type !== "tool" || content.name !== "artifact" || content.state.status !== "completed") return []
          const metadata = content.state.metadata
          const completed = content.time.completed ?? 0

          return isArtifactMetadata(metadata) && completed >= since ? [{ id: content.id, path: metadata.path }] : []
        }),
  )
}

// Fork: opens each new artifact the agent shows in the session's side panel, like Claude's artifact pane.
export function SessionArtifactOpener(props: { sessionID: () => string | undefined }) {
  const data = useData()
  const links = useExtensionHost().links
  const extensions = useExtensionAttachment()
  const opened = new Set<string>()
  // Only calls that finish while this view is mounted open the panel, so reopening a session stays quiet.
  const since = Date.now()

  createEffect(
    on(
      () => {
        const id = props.sessionID()

        return id ? newArtifacts(data.session.message.list(id), since) : []
      },
      (artifacts) => {
        for (const artifact of artifacts) {
          if (opened.has(artifact.id)) continue
          opened.add(artifact.id)
          links.open({ href: artifact.path, exact: true, session: extensions.current() })
        }
      },
    ),
  )

  // An artifact chosen on the Artifacts page (or a transcript card) opens once its session is on screen.
  createEffect(() => {
    const request = pendingArtifact()
    const session = extensions.current()
    // The session screen attaches after this mounts; wait for it so the panel has somewhere to open.
    if (!request || request.sessionID !== props.sessionID() || !session) return
    clearPendingArtifact()
    const open = () => links.open({ href: request.path, exact: true, session })
    open()
    // The file screen attaches a moment after the session does and ignores opens until then; opening a tab twice is a no-op.
    ;[400, 1200].forEach((delay) => setTimeout(open, delay))
  })

  return null
}
