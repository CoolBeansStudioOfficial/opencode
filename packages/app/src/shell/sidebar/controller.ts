import type { SessionInfo } from "@opencode/client/promise"
import { useLocation } from "@solidjs/router"
import { skipToken, useQuery } from "@tanstack/solid-query"
import { Schema } from "effect"
import { createEffect, createMemo, createSignal, startTransition, untrack } from "solid-js"
import { createHomeController } from "@/home/model"
import { HOME_SESSION_LIMIT, loadHomeSessionIndex, mergeHomeSessionIndex, retainHomeSessions } from "@/home/sessions/index"
import { buildHomeSessionRecords, homeProjectForSession, type HomeSessionRecord } from "@/home/sessions/records"
import { useLanguage } from "@/runtime/i18n/language"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { ServerConnection } from "@/runtime/server/registry"
import { sessionLabel } from "@/session/title"
import { useTabs } from "@/shell/tabs/tabs"

// Fork: Claude-style sessions sidebar. Pins and groups are stored per browser/device, keyed by server and session.
const GroupSchema = Schema.Struct({ id: Schema.String, name: Schema.String, sessions: Schema.Array(Schema.String) })

const SidebarSchema = Schema.Struct({
  open: Schema.Boolean,
  width: Schema.Number,
  pinned: Schema.Array(Schema.String),
  groups: Schema.Array(GroupSchema),
  collapsed: Schema.Array(Schema.String),
})

export type SidebarGroup = { id: string; name: string; sessions: HomeSessionRecord[] }

export function createSessionsSidebar() {
  const home = createHomeController()
  const tabs = useTabs()
  const language = useLanguage()
  const location = useLocation()

  const [state, setState] = persisted(Persist.global("sessions-sidebar"), SidebarSchema, {
    open: true,
    width: 260,
    pinned: [],
    groups: [],
    collapsed: [],
  })

  // Shares Home's query key, so both read one cached index.
  const sessionLoad = useQuery(() => {
    const ctx = home.server.focusedContext()
    const conn = home.server.focused()

    return {
      queryKey: ["home-sessions", conn] as const,
      enabled: !!ctx && ctx.sdk.connection.status() === "connected",
      queryFn: ctx
        ? ({ signal }) => loadHomeSessionIndex((input, options) => ctx.sdk.api.session.list(input, options), signal)
        : skipToken,
      retry: false,
      staleTime: 30_000,
      select: (sessions: SessionInfo[]) => () => sessions,
    }
  })

  const server = () => {
    const conn = home.server.focused()

    return conn ? ServerConnection.key(conn) : undefined
  }

  const records = createMemo(() => {
    const ctx = home.server.focusedContext()

    if (!ctx) return []

    const sessions = retainHomeSessions(
      ctx.data.session.apply(
        mergeHomeSessionIndex(sessionLoad.isPending ? [] : (sessionLoad.data?.() ?? []), ctx.data.session.list()),
      ),
      HOME_SESSION_LIMIT,
      Date.now(),
    )

    return buildHomeSessionRecords({
      sessions: () => sessions,
      projectDirectories: () => undefined,
      projects: home.project.list,
      resolveProject: ctx.projects.forSession,
    })
  })

  const [query, setQuery] = createSignal("")

  const key = (record: HomeSessionRecord) => `${server()}\0${record.session.id}`

  const visible = createMemo(() => {
    const text = query().trim().toLowerCase()

    if (!text) return records()

    return records().filter((record) =>
      `${sessionLabel(record.session)} ${record.projectName}`.toLowerCase().includes(text),
    )
  })

  const byKey = createMemo(() => new Map(visible().map((record) => [key(record), record] as const)))
  const pick = (keys: readonly string[]) => keys.flatMap((item) => byKey().get(item) ?? [])

  const pinned = createMemo(() => pick(state.pinned))

  const groups = createMemo((): SidebarGroup[] =>
    state.groups.map((group) => ({ id: group.id, name: group.name, sessions: pick(group.sessions) })),
  )

  const grouped = createMemo(() => new Set([...state.pinned, ...state.groups.flatMap((group) => group.sessions)]))

  const recents = createMemo(() => visible().filter((record) => !grouped().has(key(record))))

  const active = createMemo(() => location.pathname.match(/\/session\/([^/]+)/)?.[1])

  // Subagent sessions nest under their parent. Expanding a row loads its children; the active session's
  // parent expands on its own.
  const [expanded, setExpanded] = createSignal<ReadonlySet<string>>(new Set())

  const children = (sessionID: string) => {
    const ctx = home.server.focusedContext()

    if (!ctx) return []

    return ctx.data.session
      .list()
      .filter((session) => session.parentID === sessionID && !session.time.archived)
      .sort((a, b) => (b.time.updated ?? b.time.created) - (a.time.updated ?? a.time.created))
  }

  const loadChildren = (sessionID: string) =>
    void home.server.focusedContext()?.data.session.sync(sessionID, { children: true }).catch(() => undefined)

  createEffect(() => {
    const id = active()
    const ctx = home.server.focusedContext()

    if (!id || !ctx) return
    const root = ctx.data.session.root(id)

    if (root === id) return
    untrack(() => {
      if (!expanded().has(root)) setExpanded(new Set([...expanded(), root]))
    })
  })

  const withoutKey = (item: string) => ({
    pinned: state.pinned.filter((value) => value !== item),
    groups: state.groups.map((group) => ({ ...group, sessions: group.sessions.filter((value) => value !== item) })),
  })

  return {
    language,
    state,
    query: { value: query, set: setQuery },
    loading: () => sessionLoad.isPending,
    server,
    pinned,
    groups,
    recents,
    active,
    children,
    running: (sessionID: string) => home.server.focusedContext()?.data.session.status(sessionID) === "running",
    isExpanded: (sessionID: string) => expanded().has(sessionID),
    toggleExpanded: (sessionID: string) => {
      const next = new Set(expanded())

      if (next.has(sessionID)) next.delete(sessionID)
      else {
        next.add(sessionID)
        loadChildren(sessionID)
      }

      setExpanded(next)
    },
    isPinned: (record: HomeSessionRecord) => state.pinned.includes(key(record)),
    groupOf: (record: HomeSessionRecord) => state.groups.find((group) => group.sessions.includes(key(record)))?.id,
    toggleOpen: () => setState({ open: !state.open }),
    resize: (width: number) => setState({ width }),
    toggleCollapsed: (id: string) =>
      setState({
        collapsed: state.collapsed.includes(id)
          ? state.collapsed.filter((value) => value !== id)
          : [...state.collapsed, id],
      }),
    isCollapsed: (id: string) => state.collapsed.includes(id),
    pin: (record: HomeSessionRecord) => {
      const item = key(record)
      const rest = withoutKey(item)
      setState({ ...rest, pinned: [item, ...rest.pinned] })
    },
    unpin: (record: HomeSessionRecord) => setState({ pinned: state.pinned.filter((value) => value !== key(record)) }),
    moveToGroup: (record: HomeSessionRecord, groupID: string) => {
      const item = key(record)
      const rest = withoutKey(item)
      setState({
        ...rest,
        groups: rest.groups.map((group) =>
          group.id === groupID ? { ...group, sessions: [...group.sessions, item] } : group,
        ),
      })
    },
    removeFromGroups: (record: HomeSessionRecord) => setState(withoutKey(key(record))),
    createGroup: (record?: HomeSessionRecord) => {
      const id = crypto.randomUUID()
      const item = record ? key(record) : undefined
      const rest = item ? withoutKey(item) : { pinned: state.pinned, groups: state.groups }
      setState({
        ...rest,
        groups: [...rest.groups, { id, name: language.t("sidebar.sessions.group.new"), sessions: item ? [item] : [] }],
      })

      return id
    },
    renameGroup: (groupID: string, name: string) =>
      setState({
        groups: state.groups.map((group) =>
          group.id === groupID && name.trim() ? { ...group, name: name.trim() } : group,
        ),
      }),
    deleteGroup: (groupID: string) => setState({ groups: state.groups.filter((group) => group.id !== groupID) }),
    // Opens a session by ID, for notification taps that may name a session outside the loaded list.
    openByID: async (sessionID: string) => {
      const ctx = home.server.focusedContext()
      const conn = home.server.focused()

      if (!ctx || !conn) return
      const session = ctx.data.session.get(sessionID) ?? (await ctx.sdk.api.session.get({ sessionID }).catch(() => undefined))

      if (!session) return
      ctx.data.session.remember(session)
      void startTransition(() => tabs.select(tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: sessionID })))
    },
    newSession: home.project.openNewSession,
    canCreate: () => !!home.project.newSession(),
    open: (record: HomeSessionRecord) => {
      const conn = home.server.focused()
      const ctx = home.server.focusedContext()

      if (!conn || !ctx) return
      const directory = homeProjectForSession(record.session, home.project.list())?.worktree ?? record.session.location.directory
      void ctx.data.session.message.sync(record.session.id).catch(() => undefined)
      void startTransition(() => {
        const tab = tabs.addSessionTab({ server: ServerConnection.key(conn), sessionId: record.session.id })
        tabs.select(tab)
        ctx.data.session.remember(record.session)
        ctx.projects.open(directory)
        ctx.projects.touch(directory)
      })
    },
  }
}

export type SessionsSidebar = ReturnType<typeof createSessionsSidebar>
