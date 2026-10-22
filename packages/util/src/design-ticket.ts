import { randomBytes } from "node:crypto"
import path from "node:path"

// Fork: tickets for design frames. A design frame is an iframe the server fills with real web code: files under a
// project folder, or a local dev server it proxies. Iframes can't send the app's credentials, so the frame's URL path
// carries a ticket instead. Tickets are issued over authenticated RPC, live in this process, and each grants exactly
// one folder or one loopback port.
export type Grant = { readonly kind: "file"; readonly root: string } | { readonly kind: "live"; readonly port: number }

type Entry = { grant: Grant; expires: number }

const TTL = 24 * 60 * 60_000
const KEY = Symbol.for("opencode.design-tickets")
// Shared through globalThis so the RPC plugin and the HTTP route see the same tickets even across module copies.
const holder = globalThis as typeof globalThis & { [KEY]?: Map<string, Entry> }
const tickets = (holder[KEY] ??= new Map<string, Entry>())

/** Issues a ticket, reusing a live one for the same grant so frame URLs stay stable. */
export function issue(grant: Grant, now = Date.now()) {
  for (const [ticket, entry] of tickets) {
    if (entry.expires <= now) tickets.delete(ticket)
    else if (sameGrant(entry.grant, grant)) return ticket
  }

  const ticket = randomBytes(18).toString("base64url")
  tickets.set(ticket, { grant, expires: now + TTL })

  return ticket
}

export function resolve(ticket: string, now = Date.now()): Grant | undefined {
  const entry = tickets.get(ticket)

  if (!entry) return undefined

  if (entry.expires > now) return entry.grant
  tickets.delete(ticket)

  return undefined
}

function sameGrant(left: Grant, right: Grant) {
  return left.kind === "file" ? right.kind === "file" && left.root === right.root : right.kind === "live" && left.port === right.port
}

/** Resolves a frame request path inside a granted folder; undefined when it would escape the folder. */
export function filePath(root: string, requested: string) {
  const target = path.resolve(root, `.${path.posix.sep}${decodeURIComponent(requested)}`)
  const relative = path.relative(root, target)

  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined

  return target
}

/** Parses `/design/<ticket>/<file|live>/[<port>/]<rest>`. */
export function parseFramePath(pathname: string) {
  const match = pathname.match(/^\/design\/([\w-]{20,40})\/(file|live\/(\d{1,5}))(\/.*)?$/)

  if (!match) return undefined

  return { ticket: match[1], port: match[3] ? Number(match[3]) : undefined, rest: match[4] ?? "/" }
}

/** The frame prefix a referring frame URL belongs to, for redirecting its root-relative requests back under it. */
export function framePrefix(referer: string | undefined) {
  if (!referer) return undefined

  try {
    return new URL(referer).pathname.match(/^\/design\/[\w-]{20,40}\/(?:file|live\/\d{1,5})/)?.[0]
  } catch {
    return undefined
  }
}

/** Adds the design inspector to an HTML document, after <head> when there is one. */
export function injectInspector(html: string, src = "/design-inspector.js") {
  if (html.includes("design-inspector.js")) return html
  const tag = `<script src="${src}"></script>`
  const head = html.match(/<head\b[^>]*>/i)

  if (head?.index !== undefined) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length)

  return tag + html
}

export * as DesignTicket from "./design-ticket.js"

// Change counters for granted folders. The location watcher only follows VCS state, so design frames get their own
// recursive watch per folder; the canvas polls the counter and reloads its frames when real code changes.
const VERSIONS = Symbol.for("opencode.design-versions")
const versionHolder = globalThis as typeof globalThis & {
  [VERSIONS]?: Map<string, { count: number; close: () => void }>
}
const versions = (versionHolder[VERSIONS] ??= new Map())
const IGNORED = /(^|[\\/])(node_modules|\.git|\.hg|dist|build|\.next|\.turbo|\.cache)([\\/]|$)/

/** Starts watching a granted folder once; later calls reuse the watch. */
export function watch(root: string, start: (root: string, onChange: (file: string) => void) => () => void) {
  if (versions.has(root)) return
  const entry = { count: 0, close: () => {} }
  versions.set(root, entry)
  entry.close = start(root, (file) => {
    if (!IGNORED.test(file)) entry.count++
  })
}

/** The folder's change counter; 0 before any change or when it isn't watched. */
export function version(root: string) {
  return versions.get(root)?.count ?? 0
}
