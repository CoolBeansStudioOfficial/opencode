import { Artifacts } from "@opencode/schema/artifacts"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { createMemo } from "solid-js"
import { createHomeController } from "@/home/model"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { showToast } from "@/shell/notifications/toast"
import { useTabs } from "@/shell/tabs/tabs"
import { queueArtifactOpen } from "./pending"

// Fork: the Artifacts page and "open artifact" actions, on the server selected on Home.
export function createArtifactsController() {
  const home = createHomeController()
  const tabs = useTabs()
  const language = useLanguage()
  const ctx = home.server.focusedContext
  const rpc = () => ctx()?.sdk.api.rpc(Artifacts.Definition)

  const query = useQuery(() => {
    const server = ctx()
    const connection = home.server.focused()

    return {
      queryKey: ["artifacts", connection ? ServerConnection.key(connection) : undefined] as const,
      enabled: !!server && server.sdk.connection.status() === "connected",
      queryFn: server ? () => server.sdk.api.rpc(Artifacts.Definition).list({}) : skipToken,
      refetchInterval: 5_000,
      staleTime: 2_000,
      retry: false,
    }
  })

  const entries = createMemo((): readonly Artifacts.Entry[] => query.data ?? [])

  const fail = (error: Error) =>
    showToast({ variant: "error", title: language.t("common.requestFailed"), description: error.message })

  // The session an artifact opens in: the one that made it while it still exists, else a fresh one in its folder.
  async function sessionFor(entry: Artifacts.Entry) {
    const server = ctx()
    if (!server) return undefined
    const existing = entry.sessionID
      ? await server.sdk.api.session.get({ sessionID: entry.sessionID }).catch(() => undefined)
      : undefined
    if (existing) return existing.id
    const created = await server.sdk.api.session.create({
      location: { directory: entry.directory },
      title: entry.title,
    })
    await rpc()?.record({ path: entry.path, directory: entry.directory, sessionID: created.id })
    return created.id
  }

  async function open(entry: Artifacts.Entry) {
    const connection = home.server.focused()
    if (!connection) return
    const sessionID = await sessionFor(entry).catch((error: Error) => void fail(error))
    if (!sessionID) return
    queueArtifactOpen(sessionID, entry.path)
    tabs.select(tabs.addSessionTab({ server: ServerConnection.key(connection), sessionId: sessionID }))
    void query.refetch()
  }

  /** A new chat with a prompt about the artifact, in its folder (or its own session when it has one). */
  async function editWithChat(entry: Artifacts.Entry, prompt?: string) {
    const connection = home.server.focused()
    if (!connection) return
    if (entry.sessionID) return open(entry)
    await tabs.newDraft(
      { server: ServerConnection.key(connection), directory: entry.directory },
      prompt ?? language.t("artifacts.editPrompt", { path: entry.path }),
    )
  }

  async function create(input: {
    directory: string
    kind: Artifacts.Kind
    name: string
    folder: string
    prompt: string
  }) {
    const entry = await rpc()
      ?.create({ directory: input.directory, kind: input.kind, name: input.name, folder: input.folder || undefined })
      .catch((error: Error) => void fail(error))
    if (!entry) return
    void query.refetch()
    if (input.prompt.trim()) await editWithChat(entry, language.t("artifacts.buildPrompt", { path: entry.path, prompt: input.prompt.trim() }))
    else await open(entry)
    return entry
  }

  return { home, query, entries, rpc, open, editWithChat, create, fail, ctx }
}

export type ArtifactsController = ReturnType<typeof createArtifactsController>
