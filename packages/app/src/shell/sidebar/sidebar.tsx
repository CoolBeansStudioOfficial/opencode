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
import { SessionTabAvatarView } from "@/shell/layout/session-tab-avatar"
import { sessionLabel } from "@/session/title"
import type { SessionsSidebar as Controller } from "./controller"

// Rename inputs take focus as a menu closes; restoring focus to the trigger would blur them.
const keepFocus = (event: Event) => event.preventDefault()

const SECTION_LABEL = "text-[12px] leading-4 text-v2-text-text-faint [font-weight:530]"

export function SessionsSidebar(props: { sidebar: Controller }) {
  const sidebar = props.sidebar
  const t = sidebar.language.t
  const [ui, setUI] = createStore<{ renaming?: string; draft: string }>({ draft: "" })

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
      <button
        type="button"
        data-action="sidebar-new-session"
        disabled={!sidebar.canCreate()}
        class="flex h-8 w-full shrink-0 items-center gap-2 rounded-[6px] px-2 text-[13px] text-v2-text-text-base [font-weight:530] hover:bg-v2-overlay-simple-overlay-hover disabled:opacity-50"
        onClick={sidebar.newSession}
      >
        <Icon name="edit" class="shrink-0" />
        <span class="truncate">{t("command.session.new")}</span>
      </button>
      <label class="flex h-8 shrink-0 items-center gap-2 rounded-[6px] bg-v2-background-bg-base px-2 text-v2-text-text-faint">
        <Icon name="magnifying-glass" class="shrink-0" />
        <input
          type="search"
          data-slot="sidebar-search"
          value={sidebar.query.value()}
          placeholder={t("sidebar.sessions.search")}
          aria-label={t("sidebar.sessions.search")}
          class="min-w-0 flex-1 bg-transparent text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
          onInput={(event) => sidebar.query.set(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return
            sidebar.query.set("")
            event.currentTarget.blur()
          }}
        />
      </label>
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
          <Section
            id="recents"
            sidebar={sidebar}
            title={<span class={SECTION_LABEL}>{t("sidebar.sessions.recents")}</span>}
            actions={
              <IconButton
                type="button"
                variant="ghost-muted"
                size="small"
                icon={<Icon name="plus" />}
                aria-label={t("sidebar.sessions.group.create")}
                onClick={() => newGroup()}
              />
            }
          >
            <Show
              when={sidebar.recents().length > 0}
              fallback={
                <div class="px-2 py-1 text-[12px] text-v2-text-text-faint">
                  {sidebar.loading() ? t("common.loading") : t("sidebar.sessions.empty")}
                </div>
              }
            >
              {rows(sidebar.recents())}
            </Show>
          </Section>
        </div>
      </ScrollView>
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
      <div class="group/section flex h-7 items-center gap-1 ps-1 pe-0.5">
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-v2-text-text-faint hover:text-v2-text-text-base"
          aria-expanded={!collapsed()}
          onClick={() => props.sidebar.toggleCollapsed(props.id)}
        >
          <Icon name="chevron-down" style={{ transform: collapsed() ? "rotate(-90deg)" : undefined }} />
        </button>
        <div class="flex min-w-0 flex-1 items-center">{props.title}</div>
        <div class="flex shrink-0 items-center opacity-0 group-hover/section:opacity-100 focus-within:opacity-100">
          {props.actions}
        </div>
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
        class="group/row relative flex h-8 min-w-0 items-center rounded-[6px] hover:bg-v2-overlay-simple-overlay-hover data-[active=true]:bg-v2-overlay-simple-overlay-hover"
      >
        <button
          type="button"
          class="flex h-8 min-w-0 flex-1 items-center gap-2 bg-transparent ps-2 pe-8 text-start text-[13px]"
          classList={{ "text-v2-text-text-base": active(), "text-v2-text-text-muted": !active() }}
          aria-current={active() ? "page" : undefined}
          onClick={() => sidebar.open(props.record)}
        >
          <Show when={sidebar.server()}>
            {(server) => (
              <HomeSessionStatusController
                server={server()}
                record={props.record}
                isOpenTab={() => false}
                render={(state) => (
                  <span class="flex size-4 shrink-0 items-center justify-center">
                    <SessionTabAvatarView
                      project={props.record.project}
                      directory={props.record.session.location.directory}
                      unread={state.unread()}
                      loading={state.loading()}
                    />
                  </span>
                )}
              />
            )}
          </Show>
          <span dir="auto" class="min-w-0 flex-1 truncate">
            {sessionLabel(props.record.session)}
          </span>
        </button>
        <div class="absolute end-1 flex items-center">
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
