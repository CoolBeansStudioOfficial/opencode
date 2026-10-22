import { FSUtil } from "@opencode/util/fs-util"
import { Effect, FileSystem } from "effect"
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/http"
import { createHash } from "node:crypto"
import { load, type AssetMap, type BrotliMap } from "../app-assets"
import { DesignTicket } from "@opencode/util/design-ticket"
import { DesignInspector } from "@opencode/util/design-inspector"
import { stat } from "node:fs/promises"
import path from "node:path"

export const handler = Effect.fn("cli.web-ui.handler")(function* (options?: {
  readonly assets?: AssetMap
  readonly brotli?: BrotliMap
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const assets = options?.assets
    ? Effect.succeed({ files: options.assets, brotli: options.brotli })
    : yield* Effect.cached(load().pipe(Effect.provideService(FileSystem.FileSystem, fileSystem)))
  return <E, R>(api: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const url = new URL(request.url, "http://localhost")

      if (url.pathname.startsWith("/design/")) return yield* designFrame(request, url)

      if (url.pathname === "/design-inspector.js")
        return HttpServerResponse.text(DesignInspector.source, {
          headers: { "cache-control": "no-store" },
          contentType: "text/javascript",
        })
      // A design frame's root-relative requests (`/src/main.tsx`) belong to the frame, not the app shell.
      const frame = DesignTicket.framePrefix(request.headers.referer)

      if (frame && url.pathname !== "/design-inspector.js")
        return HttpServerResponse.empty({ status: 307, headers: { location: `${frame}${url.pathname}${url.search}` } })
      // Serve the web shell before API authentication so a signed-out browser gets the app's sign-in screen.
      if (
        url.pathname === "/api" ||
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/auth/") ||
        url.pathname === "/openapi.json"
      )
        return yield* api.pipe(
          Effect.catchIf(isRouteNotFound, () => Effect.succeed(HttpServerResponse.empty({ status: 404 }))),
        )
      return yield* assets.pipe(Effect.flatMap((loaded) => serveUI(request, url, loaded.files, loaded.brotli)))
    })
})

function serveUI(
  request: HttpServerRequest.HttpServerRequest,
  url: URL,
  assets: AssetMap,
  brotli: BrotliMap | undefined,
) {
  const key = url.pathname.replace(/^\//, "")
  // A browser that takes brotli gets the embedded bytes as they are, so the server decompresses nothing. The HTML stays
  // decoded, because its CSP hashes the inline theme script.
  const encoded = key !== "index.html" && acceptsBrotli(request.headers["accept-encoding"]) ? brotli?.[key] : undefined
  const requested = encoded ?? assets[key]
  if ((key.startsWith("_assets/") || key.startsWith("icons/")) && requested === undefined)
    return Effect.succeed(HttpServerResponse.empty({ status: 404, headers: { "cache-control": "no-store" } }))
  const name = requested !== undefined ? key : "index.html"
  const file = requested ?? assets["index.html"]
  if (file === undefined) return Effect.succeed(HttpServerResponse.empty({ status: 404 }))
  if (request.method !== "GET" && request.method !== "HEAD")
    return Effect.succeed(HttpServerResponse.empty({ status: 405 }))
  const html = name === "index.html"
  const revalidate = html || name === "sw.js" || name === "registerSW.js"
  const headers = {
    "content-type": FSUtil.mimeType(name),
    "cache-control": revalidate ? "no-cache" : "public, max-age=31536000, immutable",
    "content-security-policy": html
      ? cspForHtml(typeof file === "string" ? file : Buffer.from(file).toString())
      : csp(),
    "x-content-type-options": "nosniff",
    ...(!html && brotli?.[name] !== undefined ? { vary: "accept-encoding" } : {}),
    ...(encoded ? { "content-encoding": "br" } : {}),
  }
  return Effect.succeed(
    request.method === "HEAD"
      ? HttpServerResponse.empty({ status: 200, headers })
      : HttpServerResponse.raw(file, { headers, contentType: headers["content-type"] }),
  )
}

function acceptsBrotli(header: string | undefined) {
  return (header ?? "").split(",").some((entry) => {
    const parts = entry.split(";").map((part) => part.trim().toLowerCase())
    return parts[0] === "br" && !parts.slice(1).some((part) => /^q=0(?:\.0*)?$/.test(part))
  })
}

function isRouteNotFound(error: unknown) {
  return error instanceof HttpServerError.HttpServerError && error.reason._tag === "RouteNotFound"
}

// qr-scanner decodes in a worker it creates from a blob: URL whenever the browser has no BarcodeDetector (Safari, desktop
// Chrome on Windows and Linux). Without worker-src that worker falls under script-src 'self' and never starts.
function csp(hash = "") {
  // Fork: design canvases frame the per-port loopback proxies of local dev servers.
  return `default-src 'self'; frame-src 'self' http://127.0.0.1:* http://localhost:*; script-src 'self' 'wasm-unsafe-eval'${hash ? ` 'sha256-${hash}'` : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; connect-src * data: blob:; worker-src 'self' blob:`
}

function cspForHtml(body: string) {
  const match = body.match(
    /<script\b(?![^>]*\bsrc\s*=)[^>]*\bid=(["'])oc-theme-preload-script\1[^>]*>([\s\S]*?)<\/script>/i,
  )
  return csp(match ? createHash("sha256").update(match[2]).digest("base64") : "")
}

export * as WebUi from "./web-ui"

// Fork: design frames. `/design/<ticket>/file/<path>` serves real web code from a granted project folder and
// `/design/<ticket>/live/<port>/<path>` proxies a local dev server, both with the design inspector added to HTML.
// The ticket in the path stands in for credentials, which iframes cannot send.
const HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "content-security-policy",
  "keep-alive",
  "transfer-encoding",
  "x-frame-options",
])

function designFrame(request: HttpServerRequest.HttpServerRequest, url: URL) {
  return Effect.gen(function* () {
    // `/design/<ticket>/version`: the folder's change counter, polled by the canvas to reload its frames.
    const counter = url.pathname.match(/^\/design\/([\w-]{20,40})\/version$/)

    if (counter) {
      const grant = DesignTicket.resolve(counter[1])

      return grant?.kind === "file"
        ? HttpServerResponse.text(String(DesignTicket.version(grant.root)), { headers: { "cache-control": "no-store" } })
        : HttpServerResponse.empty({ status: 404 })
    }
    const frame = DesignTicket.parseFramePath(url.pathname)
    const grant = frame ? DesignTicket.resolve(frame.ticket) : undefined

    if (!frame || !grant) return HttpServerResponse.empty({ status: 404, headers: { "cache-control": "no-store" } })

    if (grant.kind === "file" && frame.port === undefined) return yield* designFile(grant.root, frame.rest)

    if (grant.kind === "live" && frame.port === grant.port) {
      const body =
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : yield* request.arrayBuffer.pipe(Effect.orElseSucceed(() => undefined))

      return yield* Effect.promise(() =>
        designProxy(
          request,
          grant.port,
          `${frame.rest}${url.search}`,
          DesignTicket.framePrefix(`http://frame${url.pathname}`) ?? "",
          body,
        ),
      )
    }

    return HttpServerResponse.empty({ status: 404, headers: { "cache-control": "no-store" } })
  })
}

function designFile(root: string, requested: string) {
  return Effect.promise(async () => {
    const target = DesignTicket.filePath(root, requested)

    if (!target) return HttpServerResponse.empty({ status: 404 })
    const resolved = (await stat(target).catch(() => undefined))?.isDirectory() ? path.join(target, "index.html") : target
    const file = Bun.file(resolved)

    if (!(await file.exists())) return HttpServerResponse.empty({ status: 404, headers: { "cache-control": "no-store" } })
    const type = FSUtil.mimeType(resolved)
    const headers = { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" }

    if (type.startsWith("text/html"))
      return HttpServerResponse.text(DesignTicket.injectInspector(await file.text()), { headers, contentType: type })

    return HttpServerResponse.raw(new Uint8Array(await file.arrayBuffer()), { headers, contentType: type })
  })
}

async function designProxy(
  request: HttpServerRequest.HttpServerRequest,
  port: number,
  target: string,
  prefix: string,
  body: ArrayBuffer | undefined,
) {
  const headers = new Headers()

  for (const [name, value] of Object.entries(request.headers)) {
    const lower = name.toLowerCase()

    // The app's own session cookie and host stay with the app; the dev server sees itself as the host.
    if (lower === "host" || lower === "referer" || lower === "origin" || HOP_HEADERS.has(lower)) continue

    if (lower === "cookie") {
      const kept = value
        .split(";")
        .map((part) => part.trim())
        .filter((part) => part && !part.startsWith("opencode_session"))
        .join("; ")

      if (kept) headers.set("cookie", kept)
      continue
    }

    headers.set(name, value)
  }

  const upstream = await fetch(`http://127.0.0.1:${port}${target}`, {
    method: request.method,
    headers,
    body,
    redirect: "manual",
  }).catch((error: Error) => error)

  if (upstream instanceof Error)
    return HttpServerResponse.text(`The dev server on port ${port} is not reachable: ${upstream.message}`, {
      status: 502,
      headers: { "cache-control": "no-store" },
    })
  const out: Record<string, string> = { "cache-control": "no-store" }

  upstream.headers.forEach((value, name) => {
    if (!HOP_HEADERS.has(name.toLowerCase()) && name.toLowerCase() !== "cache-control") out[name] = value
  })
  const location = upstream.headers.get("location")

  if (location) {
    const next = new URL(location, `http://127.0.0.1:${port}${target}`)
    const local = ["127.0.0.1", "localhost"].includes(next.hostname) && Number(next.port || 80) === port
    out.location = local ? `${prefix}${next.pathname}${next.search}` : location
  }
  const type = upstream.headers.get("content-type") ?? "application/octet-stream"

  if (type.startsWith("text/html"))
    return HttpServerResponse.text(DesignTicket.injectInspector(await upstream.text()), {
      status: upstream.status,
      headers: out,
      contentType: type,
    })

  return HttpServerResponse.raw(new Uint8Array(await upstream.arrayBuffer()), {
    status: upstream.status,
    headers: out,
    contentType: type,
  })
}
