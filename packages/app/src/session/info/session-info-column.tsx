import { GitActions } from "@opencode/schema/git-actions"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon, type IconProps } from "@opencode/ui/icon"
import { createMemo, createResource, For, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { usePermissionMode } from "@/composer/permission-mode"
import { useLanguage } from "@/runtime/i18n/language"
import { useServerSDK } from "@/runtime/server/client"
import { useServer } from "@/runtime/server/current"
import { useSessionContext } from "./context"
import { GitDialog } from "@/session/git/git-dialog"
import { useOpenSessionRoute } from "@/session/session-identity-header"
import { sessionTitle } from "@/session/title"

// Fork: Claude desktop's session info column. Every card reads live session data; nothing here is stored.
export function SessionInfoColumn(props: { sessionID: string; directory?: string }) {
  const server = useServer()
  const sdk = useServerSDK()
  const language = useLanguage()
  const dialog = useDialog()
  const permission = usePermissionMode()
  const open = useOpenSessionRoute()
  const [collapsed, setCollapsed] = createStore<Record<string, boolean>>({})

  const session = () => server.ctx.data.session
  const messages = createMemo(() => session().message.list(props.sessionID))
  const folder = () => props.directory?.split(/[\\/]/).filter(Boolean).at(-1) ?? ""

  const [git] = createResource(
    () => props.directory,
    (directory) =>
      sdk.api
        .rpc(GitActions.Definition)
        .status({ directory })
        .catch(() => undefined),
  )

  // The newest turn's diff; it refetches when the transcript grows.
  const [diff] = createResource(
    () => ({ id: props.sessionID, count: messages().length }),
    (key) =>
      sdk.api.session
        .diff({ sessionID: key.id })
        .catch(() => undefined),
  )

  const context = useSessionContext(
    () => props.sessionID,
    () => props.directory,
  )

  // Files the agent wrote or edited in this session, newest first.
  const outputs = createMemo(() => {
    const paths = messages().flatMap((message) =>
      message.type === "assistant"
        ? message.content.flatMap((part) => {
            if (part.type !== "tool" || (part.name !== "write" && part.name !== "edit")) return []
            const input = part.state.input
            const path = typeof input === "object" && !Array.isArray(input) ? input["filePath"] : undefined

            return typeof path === "string" ? [path] : []
          })
        : [],
    )

    return [...new Set(paths.reverse())].slice(0, 8)
  })

  const children = createMemo(() =>
    session()
      .list()
      .filter((item) => item.parentID === props.sessionID && !item.time.archived)
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created)),
  )
  const running = () => children().filter((item) => session().status(item.id) === "running")
  const finished = () => children().length - running().length

  const additions = () => diff()?.reduce((total, file) => total + file.additions, 0) ?? 0
  const deletions = () => diff()?.reduce((total, file) => total + file.deletions, 0) ?? 0

  return (
    <aside
      data-component="session-info-column"
      class="flex h-full w-[320px] shrink-0 flex-col gap-2 overflow-y-auto py-2 pe-2 text-[14px] leading-5 text-v2-text-text-base no-scrollbar"
    >
      <Card id="environment" title={language.t("session.info.environment")} collapsed={collapsed} onToggle={setCollapsed}>
        <Row icon="monitor" label={language.t("session.info.thisComputer")} />
        <Row icon="folder" label={folder()} detail={props.directory} />
        <Show when={git()?.branch}>{(branch) => <Row icon="branch" label={branch()} />}</Show>
        <Row icon="outline-eye" label={permission.label(permission.current())} />
      </Card>
      <div
        data-slot="info-context"
        class="flex items-center gap-2 rounded-[12px] bg-v2-background-bg-layer-01 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--v2-border-border-muted)]"
      >
        <span class="font-medium">{language.t("session.info.context")}</span>
        <span class="ms-auto text-v2-text-text-muted">{context() === undefined ? "–" : `${context()}%`}</span>
        <span class="h-2 w-6 overflow-hidden rounded-full bg-v2-background-bg-layer-04">
          <span class="block h-full rounded-full bg-v2-text-text-accent" style={{ width: `${context() ?? 0}%` }} />
        </span>
      </div>
      <Card id="outputs" title={language.t("session.info.outputs")} collapsed={collapsed} onToggle={setCollapsed}>
        <For
          each={outputs()}
          fallback={<span class="px-1 text-v2-text-text-faint">{language.t("session.info.noOutputs")}</span>}
        >
          {(path) => <Row icon="outline-copy" label={path.split(/[\\/]/).at(-1) ?? path} detail={path} />}
        </For>
      </Card>
      <Show when={git()?.repository}>
        <Card id="changes" title={language.t("session.info.changes")} collapsed={collapsed} onToggle={setCollapsed}>
          <div class="flex items-center gap-2 px-1">
            <Icon name="review" class="shrink-0 text-v2-icon-icon-muted" />
            <Show
              when={additions() + deletions() > 0}
              fallback={
                <span class="text-v2-text-text-muted">
                  {language.t("session.git.changes", { count: git()?.changes ?? 0 })}
                </span>
              }
            >
              <span class="text-v2-state-fg-success">+{additions().toLocaleString()}</span>
              <span class="text-v2-state-fg-danger">−{deletions().toLocaleString()}</span>
            </Show>
            <Show when={props.directory}>
              {(directory) => (
                <Button
                  size="small"
                  variant="neutral"
                  class="ms-auto"
                  disabled={!git()?.gh}
                  onClick={() => void dialog.show(() => <GitDialog directory={directory()} />)}
                >
                  {language.t("session.info.createPR")}
                </Button>
              )}
            </Show>
          </div>
        </Card>
      </Show>
      <Show when={children().length > 0}>
        <Card id="background" title={language.t("session.info.background")} collapsed={collapsed} onToggle={setCollapsed}>
          <For each={running()}>
            {(child) => (
              <button
                type="button"
                class="flex items-center gap-2 rounded-[8px] px-1 py-0.5 text-start hover:bg-v2-overlay-simple-overlay-hover"
                onClick={() => open(props.sessionID, child.id)}
              >
                <Icon name="status-active" class="shrink-0 animate-pulse text-v2-text-text-accent" />
                <span class="min-w-0 flex-1 truncate">
                  {sessionTitle(child.title) ?? language.t("session.tab.session")}
                </span>
              </button>
            )}
          </For>
          <Show when={finished() > 0}>
            <span class="flex items-center gap-2 px-1 text-v2-text-text-muted">
              <Icon name="check" class="shrink-0" />
              {language.plural("session.info.finished", finished())}
            </span>
          </Show>
        </Card>
      </Show>
    </aside>
  )
}

function Card(props: {
  id: string
  title: string
  collapsed: Record<string, boolean>
  onToggle: (id: string, value: boolean) => void
  children: JSX.Element
}) {
  return (
    <section
      data-slot="info-card"
      class="flex flex-col gap-1.5 rounded-[12px] bg-v2-background-bg-layer-01 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--v2-border-border-muted)]"
    >
      <button
        type="button"
        class="flex items-center gap-1 text-start font-medium"
        aria-expanded={!props.collapsed[props.id]}
        onClick={() => props.onToggle(props.id, !props.collapsed[props.id])}
      >
        {props.title}
        <Icon
          name="chevron-down"
          class="text-v2-text-text-faint"
          style={{ transform: props.collapsed[props.id] ? "rotate(-90deg)" : undefined }}
        />
      </button>
      <Show when={!props.collapsed[props.id]}>
        <div class="flex flex-col gap-1">{props.children}</div>
      </Show>
    </section>
  )
}

function Row(props: { icon: IconProps["name"]; label: string; detail?: string }) {
  return (
    <div class="flex min-w-0 items-center gap-2 px-1" title={props.detail}>
      <Icon name={props.icon} class="shrink-0 text-v2-icon-icon-muted" />
      <span class="min-w-0 truncate">{props.label}</span>
    </div>
  )
}
