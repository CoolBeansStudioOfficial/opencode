import { Artifacts } from "@opencode/schema/artifacts"
import { Button } from "@opencode/ui/button"
import { Select } from "@opencode/ui/select"
import { registryKind } from "@opencode/util/artifact-registry"
import { getFilename } from "@opencode/util/path"
import { createMemo, createSignal, Show } from "solid-js"
import { createLatest, useExtension, type FileContent, type MountedSession } from "../sdk"
import { blobUrlFromContent } from "./artifact"
import { resolveOpenInAppPath } from "./path"

// Fork: the Claude-style artifact header actions: version history with restore, Copy, Download, and adding a file
// to the Artifacts gallery. Registry features appear for files the viewer can show as artifacts.
const normalize = (path: string) => path.replaceAll("\\", "/").toLowerCase()

export function ArtifactActions(props: { session: MountedSession; path: string; content: FileContent }) {
  const ctx = useExtension()
  const [tick, setTick] = createSignal(0)
  const [copied, setCopied] = createSignal(false)
  const rpc = () => props.session.server.client.rpc(Artifacts.Definition)

  const absolute = () => {
    const root = ctx.screen.current()?.file.root

    return root === undefined ? undefined : resolveOpenInAppPath(root, props.path)
  }

  const supported = () => registryKind(props.path) !== undefined

  const entries = createLatest(
    () => (supported() ? { server: props.session.server, tick: tick() } : undefined),
    (value) => value.server.client.rpc(Artifacts.Definition).list({}),
  )

  const entry = createMemo(() => {
    const path = absolute()

    return path ? entries.latest?.find((item) => normalize(item.path) === normalize(path)) : undefined
  })

  const history = createLatest(
    () => {
      const current = entry()

      return current ? { server: props.session.server, id: current.id, versions: current.versions } : undefined
    },
    (value) => value.server.client.rpc(Artifacts.Definition).history({ id: value.id }),
  )

  const restore = async (version: Artifacts.Version | null) => {
    const current = entry()

    if (!version || !current || version.n === current.versions) return
    await rpc().restore({ id: current.id, n: version.n })
    await ctx.screen.current()?.file.sync(props.path, { force: true })
    setTick(tick() + 1)
  }

  const add = async () => {
    const path = absolute()

    if (!path) return
    await rpc().record({ path, directory: props.session.directory, sessionID: props.session.id })
    setTick(tick() + 1)
  }

  const copy = async () => {
    await navigator.clipboard.writeText(props.content.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const url = blobUrlFromContent(props.content)
    const link = document.createElement("a")

    link.href = url
    link.download = getFilename(props.path)
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const time = (value: number) =>
    new Intl.DateTimeFormat(ctx.locale.locale(), { hour: "numeric", minute: "2-digit" }).format(
      value,
    )

  return (
    <>
      <Show when={supported()}>
        <Show
          when={entry()}
          fallback={
            <Button size="small" variant="ghost" data-action="artifact-add" onClick={() => void add()}>
              {ctx.t("artifact.add")}
            </Button>
          }
        >
          {(current) => (
            <Show when={(history.latest?.length ?? 0) > 1}>
              <Select
                options={[...(history.latest ?? [])]}
                current={history.latest?.find((version) => version.n === current().versions)}
                label={(version) => `${ctx.t("artifact.version", { n: version.n })} · ${time(version.time)}`}
                value={(version) => String(version.n)}
                onSelect={(version) => void restore(version)}
                aria-label={ctx.t("artifact.versions")}
              />
            </Show>
          )}
        </Show>
      </Show>
      <Show when={props.content.type === "text"}>
        <Button size="small" variant="ghost" data-action="artifact-copy" onClick={() => void copy()}>
          {ctx.t(copied() ? "artifact.copied" : "artifact.copy")}
        </Button>
      </Show>
      <Button size="small" variant="ghost" data-action="artifact-download" onClick={download}>
        {ctx.t("artifact.download")}
      </Button>
    </>
  )
}
