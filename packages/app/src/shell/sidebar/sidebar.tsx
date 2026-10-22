import { ArtifactsLink } from "./artifacts-link"
import { For, Show, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { InlineInput } from "@opencode/ui/inline-input"
import { Menu } from "@opencode/ui/menu"
import { ResizeHandle } from "@opencode/ui/resize-handle"
import { ScrollView } from "@opencode/ui/scroll-view"
import type { HomeSessionRecord } from "@/home/sessions/records"
import { HomeSessionStatusController } from "@/home/sessions/controller"
import { sessionLabel } from "@/session/title"
import { useSettingsSurface } from "@/settings/surface"
import { useCurrentRoute } from "@/shell/state/layout"
import type { SessionsSidebar as Controller } from "./controller"

// Rename inputs take focus as a menu closes; restoring focus to the trigger would blur them.
const keepFocus = (event: Event) => event.preventDefault()

const SECTION_LABEL = "text-[13px] leading-4 text-v2-text-text-faint"

const NAV_ITEM =
  "flex h-8 w-full shrink-0 items-center gap-2.5 rounded-[8px] px-2 text-[14px] leading-5 text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base disabled:opacity-50 data-[active=true]:bg-v2-background-bg-layer-02 data-[active=true]:text-v2-text-text-base"

export function SessionsSidebar(props: { sidebar: Controller }) {
  const sidebar = props.sidebar
  const t = sidebar.language.t
  const settings = useSettingsSurface()
  const [ui, setUI] = createStore<{ renaming?: string; draft: string; more: boolean }>({ draft: "", more: false })


  const route = useCurrentRoute()
  const openScheduled = () => {
    const server = sidebar.server()

    if (server) settings.openServer(server)
    else settings.open()
  }

  const serverName = () => {
    const server = sidebar.server()

    return server ? (URL.canParse(server) ? new URL(server).host : server) : "OpenCode"
  }

  const startRename = (id: string, name: string) => {
    setUI({ renaming: id, draft: name })
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-sidebar-group-rename="${id}"]`)
      input?.focus()
      input?.select()
    })
  }

  const commitRename = () => {
    if (ui.renaming) sidebar.renameGroup(ui.renaming, ui.draft)
    setUI({ renaming: undefined })
  }

  const newGroup = (record?: HomeSessionRecord) => {
    const id = sidebar.createGroup(record)
    startRename(id, t("sidebar.sessions.group.new"))
  }

  const rows = (records: HomeSessionRecord[]) => (
    <For each={records}>{(record) => <SessionRow sidebar={sidebar} record={record} onNewGroup={newGroup} />}</For>
  )

  return (
    <aside
      data-component="sessions-sidebar"
      class="relative flex h-full min-h-0 shrink-0 flex-col gap-2 bg-v2-background-bg-deep ps-2 pe-1 pt-[var(--shell-top-inset,8px)] pb-[var(--shell-bottom-inset,8px)]"
      style={{ width: `${sidebar.state.width}px` }}
    >
      <ResizeHandle
        class="-end-1"
        direction="horizontal"
        size={sidebar.state.width}
        min={200}
        max={480}
        onResize={sidebar.resize}
      />
      <label data-slot="sidebar-search-field" class="flex h-8 shrink-0 items-center gap-2 rounded-[10px] bg-v2-background-bg-layer-01 px-2.5 text-v2-text-text-faint shadow-[inset_0_0_0_1px_var(--v2-border-border-muted)]">
        <Icon name="magnifying-glass" class="shrink-0" />
        <input
          type="search"
          data-slot="sidebar-search"
          value={sidebar.query.value()}
          placeholder={t("sidebar.nav.search")}
          aria-label={t("sidebar.sessions.search")}
          class="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
          onInput={(event) => sidebar.query.set(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            sidebar.query.set("")
            event.currentTarget.blur()
          }}
        />
      </label>
      <nav data-slot="sidebar-nav" class="flex shrink-0 flex-col gap-0.5">
        <button
          type="button"
          data-action="sidebar-new-session"
          data-active={route().type === "draft"}
          disabled={!sidebar.canCreate()}
          class={NAV_ITEM}
          onClick={sidebar.newSession}
        >
          <Icon name="plus" class="shrink-0" />
          <span class="truncate">{t("sidebar.nav.new")}</span>
        </button>
        <ArtifactsLink />
        <button type="button" data-action="sidebar-customize" class={NAV_ITEM} onClick={() => settings.open()}>
          <Icon name="outline-sliders" class="shrink-0" />
          <span class="truncate">{t("sidebar.nav.customize")}</span>
        </button>
        <button type="button" data-action="sidebar-more" class={NAV_ITEM} aria-expanded={ui.more} onClick={() => setUI("more", !ui.more)}>
          <Icon name="outline-dots" class="shrink-0" />
          <span class="truncate">{t("sidebar.nav.more")}</span>
        </button>
        <Show when={ui.more}>
          <button type="button" data-action="sidebar-scheduled" class={NAV_ITEM} onClick={openScheduled}>
            <Icon name="clock" class="shrink-0" />
            <span class="truncate">{t("sidebar.nav.scheduled")}</span>
          </button>
        </Show>
      </nav>
      <ScrollView class="min-h-0 flex-1">
        <div class="flex flex-col gap-3 pb-2 pe-1">
          <Show when={sidebar.pinned().length > 0}>
            <Section id="pinned" sidebar={sidebar} title={<span class={SECTION_LABEL}>{t("sidebar.sessions.pinned")}</span>}>
              {rows(sidebar.pinned())}
            </Section>
          </Show>
          <For each={sidebar.groups()}>
            {(group) => (
              <Section
                id={group.id}
                sidebar={sidebar}
                title={
                  <Show
                    when={ui.renaming === group.id}
                    fallback={
                      <span class={`${SECTION_LABEL} truncate`} onDblClick={() => startRename(group.id, group.name)}>
                        {group.name}
                      </span>
                    }
                  >
                    <InlineInput
                      data-sidebar-group-rename={group.id}
                      aria-label={t("common.rename")}
                      value={ui.draft}
                      class={`${SECTION_LABEL} min-w-0 flex-1 outline-none`}
                      onInput={(event) => setUI("draft", event.currentTarget.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        event.stopPropagation()

                        if (event.key === "Enter") commitRename()

                        if (event.key === "Escape") setUI({ renaming: undefined })
                      }}
                    />
                  </Show>
                }
                actions={
                  <Menu modal={false} placement="bottom-end" gutter={2}>
                    <Menu.Trigger
                      as={IconButton}
                      type="button"
                      variant="ghost-muted"
                      size="small"
                      icon={<Icon name="outline-dots" />}
                      aria-label={t("sidebar.sessions.group.options")}
                    />
                    <Menu.Portal>
                      <Menu.Content onCloseAutoFocus={keepFocus}>
                        <Menu.Item onSelect={() => startRename(group.id, group.name)}>{t("common.rename")}</Menu.Item>
                        <Menu.Item onSelect={() => sidebar.deleteGroup(group.id)}>
                          {t("sidebar.sessions.group.delete")}
                        </Menu.Item>
                      </Menu.Content>
                    </Menu.Portal>
                  </Menu>
                }
              >
                <Show
                  when={group.sessions.length > 0}
                  fallback={<div class="px-2 py-1 text-[12px] text-v2-text-text-faint">{t("sidebar.sessions.group.empty")}</div>}
                >
                  {rows(group.sessions)}
                </Show>
              </Section>
            )}
          </For>
          <Show
            when={sidebar.projectGroups().length > 0}
            fallback={
              <div class="px-2 py-1 text-[13px] text-v2-text-text-faint">
                {sidebar.loading() ? t("common.loading") : t("sidebar.sessions.empty")}
              </div>
            }
          >
            <For each={sidebar.projectGroups()}>
              {(project) => (
                <Section
                  id={`project:${project.directory}`}
                  sidebar={sidebar}
                  title={<span class={`${SECTION_LABEL} truncate`}>{project.name}</span>}
                  actions={
                    <IconButton
                      type="button"
                      variant="ghost-muted"
                      size="small"
                      icon={<Icon name="plus" />}
                      aria-label={t("sidebar.project.newSession", { project: project.name })}
                      onClick={() => sidebar.newSessionIn(project.directory)}
                    />
                  }
                >
                  {rows(project.sessions)}
                </Section>
              )}
            </For>
          </Show>
        </div>
      </ScrollView>
      <div data-slot="sidebar-footer" class="flex h-12 shrink-0 items-center gap-2 px-1.5">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-v2-background-bg-layer-03 text-[12px] leading-4 text-v2-text-text-base">
          {serverName().charAt(0).toUpperCase()}
        </span>
        <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 text-start text-[14px] leading-5 text-v2-text-text-base" onClick={() => settings.open()}>
          <span class="truncate">{serverName()}</span>
          <Icon name="chevron-down" class="shrink-0 text-v2-text-text-faint" />
        </button>
        <IconButton
          type="button"
          variant="ghost-muted"
          size="small"
          icon={<Icon name="settings-gear" />}
          aria-label={t("command.settings.open")}
          onClick={() => settings.open()}
        />
      </div>
    </aside>
  )
}

function Section(props: {
  id: string
  sidebar: Controller
  title: JSX.Element
  actions?: JSX.Element
  children: JSX.Element
}) {
  const collapsed = () => props.sidebar.isCollapsed(props.id)

  return (
    <section data-slot="sidebar-section" data-section-id={props.id} class="flex flex-col">
      <div class="group/section flex h-8 items-center gap-1 ps-2 pe-1">
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center text-start"
          aria-expanded={!collapsed()}
          onClick={() => props.sidebar.toggleCollapsed(props.id)}
        >
          {props.title}
        </button>
        <div class="flex shrink-0 items-center">{props.actions}</div>
      </div>
      <Show when={!collapsed()}>
        <div class="flex flex-col">{props.children}</div>
      </Show>
    </section>
  )
}

function SessionRow(props: { sidebar: Controller; record: HomeSessionRecord; onNewGroup: (record: HomeSessionRecord) => void }) {
  const sidebar = props.sidebar
  const t = sidebar.language.t
  const active = () => sidebar.active() === props.record.session.id

  const items = () => (
    <>
      <Show
        when={sidebar.isPinned(props.record)}
        fallback={<Menu.Item onSelect={() => sidebar.pin(props.record)}>{t("sidebar.sessions.pin")}</Menu.Item>}
      >
        <Menu.Item onSelect={() => sidebar.unpin(props.record)}>{t("sidebar.sessions.unpin")}</Menu.Item>
      </Show>
      <Menu.Separator />
      <Menu.Group>
        <Menu.GroupLabel>{t("sidebar.sessions.moveToGroup")}</Menu.GroupLabel>
        <For each={sidebar.state.groups}>
          {(group) => (
            <Menu.Item
              disabled={sidebar.groupOf(props.record) === group.id}
              onSelect={() => sidebar.moveToGroup(props.record, group.id)}
            >
              {group.name}
            </Menu.Item>
          )}
        </For>
        <Menu.Item onSelect={() => props.onNewGroup(props.record)}>{t("sidebar.sessions.group.create")}</Menu.Item>
      </Menu.Group>
      <Show when={sidebar.groupOf(props.record)}>
        <Menu.Item onSelect={() => sidebar.removeFromGroups(props.record)}>
          {t("sidebar.sessions.removeFromGroup")}
        </Menu.Item>
      </Show>
    </>
  )

  const id = () => props.record.session.id
  const children = () => sidebar.children(id())

  return (
    <>
    <Menu.Context modal={false}>
      <Menu.Context.Trigger
        as="div"
        data-component="sidebar-session-row"
        data-session-id={props.record.session.id}
        data-active={active()}
        class="group/row relative flex h-9 min-w-0 items-center rounded-[8px] hover:bg-v2-overlay-simple-overlay-hover data-[active=true]:bg-v2-background-bg-layer-02"
      >
        <button
          type="button"
          class="flex h-9 min-w-0 flex-1 items-center gap-2 bg-transparent ps-2 pe-2 text-start text-[14px] leading-5"
          classList={{ "text-v2-text-text-base": active(), "text-v2-text-text-muted": !active() }}
          aria-current={active() ? "page" : undefined}
          onClick={() => sidebar.open(props.record)}
        >
          <span dir="auto" class="min-w-0 flex-1 truncate">
            {sessionLabel(props.record.session)}
          </span>
          <Show when={sidebar.server()}>
            {(server) => (
              <HomeSessionStatusController
                server={server()}
                record={props.record}
                isOpenTab={() => false}
                render={(state) => (
                  <Show when={sidebar.needsInput(id()) || state.loading() || state.unread()}>
                    <span
                      aria-hidden="true"
                      data-slot="session-status-dot"
                      class="size-2 shrink-0 rounded-full group-hover/row:invisible"
                      classList={{
                        "bg-v2-state-fg-warning": sidebar.needsInput(id()),
                        "bg-v2-background-bg-accent animate-pulse": !sidebar.needsInput(id()) && state.loading(),
                        "bg-v2-state-fg-info": !sidebar.needsInput(id()) && !state.loading() && state.unread(),
                      }}
                    />
                  </Show>
                )}
              />
            )}
          </Show>
        </button>
        <div class="absolute end-1 flex items-center bg-inherit">
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            class="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            classList={{ "opacity-100!": children().length > 0 }}
            icon={<Icon name="chevron-down" style={{ transform: sidebar.isExpanded(id()) ? undefined : "rotate(-90deg)" }} />}
            aria-expanded={sidebar.isExpanded(id())}
            aria-label={t("sidebar.sessions.subagents")}
            onClick={() => sidebar.toggleExpanded(id())}
          />
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            class="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            classList={{ "opacity-100!": sidebar.isPinned(props.record) }}
            icon={<Icon name="pin" />}
            aria-label={sidebar.isPinned(props.record) ? t("sidebar.sessions.unpin") : t("sidebar.sessions.pin")}
            onClick={() => (sidebar.isPinned(props.record) ? sidebar.unpin(props.record) : sidebar.pin(props.record))}
          />
          <IconButton
            type="button"
            variant="ghost-muted"
            size="small"
            class="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
            icon={<Icon name="archive" />}
            aria-label={t("sidebar.sessions.archive")}
            onClick={() => void sidebar.archive(props.record)}
          />
          <div class="opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
          <Menu modal={false} placement="bottom-end" gutter={2}>
            <Menu.Trigger
              as={IconButton}
              type="button"
              variant="ghost-muted"
              size="small"
              icon={<Icon name="outline-dots" />}
              aria-label={t("sidebar.sessions.options")}
            />
            <Menu.Portal>
              <Menu.Content onCloseAutoFocus={keepFocus}>{items()}</Menu.Content>
            </Menu.Portal>
          </Menu>
          </div>
        </div>
      </Menu.Context.Trigger>
      <Menu.Context.Portal>
        <Menu.Context.Content onCloseAutoFocus={keepFocus}>{items()}</Menu.Context.Content>
      </Menu.Context.Portal>
    </Menu.Context>
    <Show when={sidebar.isExpanded(id())}>
      <div data-slot="sidebar-subagents" class="ms-5 flex flex-col border-s border-v2-border-border-base ps-1">
        <Show
          when={children().length > 0}
          fallback={<div class="px-2 py-1 text-[12px] text-v2-text-text-faint">{t("sidebar.sessions.noSubagents")}</div>}
        >
          <For each={children()}>
            {(child) => (
              <button
                type="button"
                data-component="sidebar-subagent-row"
                data-active={sidebar.active() === child.id}
                class="flex h-7 min-w-0 items-center gap-2 rounded-[6px] px-2 text-start text-[12px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover data-[active=true]:bg-v2-overlay-simple-overlay-hover data-[active=true]:text-v2-text-text-base"
                onClick={() => void sidebar.openByID(child.id)}
              >
                <span
                  aria-hidden="true"
                  class="size-1.5 shrink-0 rounded-full"
                  classList={{
                    "bg-v2-text-text-accent animate-pulse": sidebar.running(child.id),
                    "bg-v2-text-text-faint": !sidebar.running(child.id),
                  }}
                />
                <span dir="auto" class="min-w-0 flex-1 truncate">
                  {sessionLabel(child)}
                </span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </Show>
    </>
  )
}
