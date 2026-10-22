import { source as inspector } from "./design-inspector.js"
import { injectInspector } from "./design-ticket.js"

// Fork: root-preserving live proxies for design frames. A frame of the running app needs its real paths (routers read
// `location.pathname`) and an injected inspector, so each local dev server gets its own loopback-only proxy on a free
// port: same paths, inspector added to HTML, frame-blocking headers removed, WebSockets (dev-server hot reload) passed
// through. It is reachable only from this machine, like the dev server it fronts.

const INSPECTOR_PATH = "/__opencode/design-inspector.js"
const DROP = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "content-security-policy",
  "cross-origin-opener-policy",
  "keep-alive",
  "transfer-encoding",
  "x-frame-options",
])
const KEY = Symbol.for("opencode.design-proxies")
const holder = globalThis as typeof globalThis & { [KEY]?: Map<number, { origin: string; stop: () => void }> }
const proxies = (holder[KEY] ??= new Map())

type Socket = { path: string; protocols: string[]; upstream?: WebSocket; queue: (string | Uint8Array<ArrayBuffer>)[] }

// A copy backed by a plain ArrayBuffer, which WebSocket.send accepts.
const frame = (message: string | Uint8Array) => (typeof message === "string" ? message : new Uint8Array(message))

/** Starts (once) the proxy for a loopback dev server port and returns its origin, e.g. `http://127.0.0.1:53211`. */
export function liveProxy(port: number) {
  const existing = proxies.get(port)

  if (existing) return existing.origin
  const target = `127.0.0.1:${port}`

  const server = Bun.serve<Socket>({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, bun): Promise<Response | undefined> {
      const url = new URL(request.url)

      if (url.pathname === INSPECTOR_PATH)
        return new Response(inspector, { headers: { "content-type": "text/javascript", "cache-control": "no-store" } })

      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const protocols = (request.headers.get("sec-websocket-protocol") ?? "").split(",").map((value) => value.trim())
        const upgraded = bun.upgrade(request, {
          data: { path: `${url.pathname}${url.search}`, protocols: protocols.filter(Boolean), queue: [] },
          headers: protocols[0] ? { "sec-websocket-protocol": protocols[0] } : undefined,
        })

        return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 })
      }

      return forward(request, target, url, bun.url.origin)
    },
    websocket: {
      open(socket) {
        const upstream = new WebSocket(`ws://${target}${socket.data.path}`, socket.data.protocols)
        upstream.binaryType = "arraybuffer"
        socket.data.upstream = upstream
        upstream.onopen = () => {
          for (const message of socket.data.queue.splice(0)) upstream.send(message)
        }
        upstream.onmessage = (event) =>
          socket.send(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer))
        upstream.onclose = () => socket.close()
        upstream.onerror = () => socket.close()
      },
      message(socket, message) {
        const upstream = socket.data.upstream

        if (upstream?.readyState === WebSocket.OPEN) upstream.send(frame(message))
        else socket.data.queue.push(frame(message))
      },
      close(socket) {
        socket.data.upstream?.close()
      },
    },
  })

  const origin = server.url.origin
  proxies.set(port, { origin, stop: () => server.stop(true) })

  return origin
}

async function forward(request: Request, target: string, url: URL, origin: string) {
  const headers = new Headers()

  request.headers.forEach((value, name) => {
    const lower = name.toLowerCase()

    // The app's session cookie is host-wide (cookies ignore ports), so it must not reach the dev server.
    if (lower === "cookie") {
      const kept = value
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("opencode_session"))
        .join("; ")

      if (kept) headers.set("cookie", kept)

      return
    }

    if (!DROP.has(lower) && lower !== "host") headers.set(name, value)
  })
  headers.set("host", target)
  const upstream = await fetch(`http://${target}${url.pathname}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
    redirect: "manual",
  }).catch((error: Error) => error)

  if (upstream instanceof Error)
    return new Response(`The dev server on ${target} is not reachable: ${upstream.message}`, { status: 502 })
  const out = new Headers()

  upstream.headers.forEach((value, name) => {
    if (!DROP.has(name.toLowerCase())) out.set(name, value)
  })
  const location = upstream.headers.get("location")

  if (location) {
    const next = new URL(location, `http://${target}${url.pathname}`)

    if (["127.0.0.1", "localhost"].includes(next.hostname) && next.port === target.split(":")[1])
      out.set("location", `${origin}${next.pathname}${next.search}${next.hash}`)
  }

  if ((upstream.headers.get("content-type") ?? "").startsWith("text/html")) {
    out.set("cache-control", "no-store")

    return new Response(injectInspector(await upstream.text(), INSPECTOR_PATH), { status: upstream.status, headers: out })
  }

  return new Response(upstream.body, { status: upstream.status, headers: out })
}

export * as DesignProxy from "./design-proxy.js"
