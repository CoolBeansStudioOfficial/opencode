import type { SessionMessageInfo } from "@opencode/client/promise"
import { createEffect, on } from "solid-js"
import { useExtensionHost } from "@/runtime/extension/host"
import { useExtensionAttachment } from "@/runtime/extension/host-apis"
import { useData } from "@/runtime/server/current"

/** Paths of `artifact` tool calls that completed at or after `since`, oldest first. */
export function newArtifacts(messages: readonly SessionMessageInfo[], since: number) {
  return messages.flatMap((message) =>
    message.type !== "assistant"
      ? []
      : message.content.flatMap((content) => {
          if (content.type !== "tool" || content.name !== "artifact" || content.state.status !== "completed") return []
          const path = content.state.metadata?.path
          const completed = content.time.completed ?? 0

          return typeof path === "string" && completed >= since ? [{ id: content.id, path }] : []
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

  return null
}
