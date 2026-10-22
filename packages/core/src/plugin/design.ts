export * as DesignPlugin from "./design.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Design } from "@opencode/schema/design"
import { DesignTicket } from "@opencode/util/design-ticket"
import { DesignProxy } from "@opencode/util/design-proxy"
import { Effect } from "effect"
import { readdirSync, statSync, watch as watchFolder, type FSWatcher } from "node:fs"
import path from "node:path"

// Fork: issues the ticketed URL prefixes design frames load from (see packages/util/src/design-ticket.ts). An empty
// string means the folder or port can't be framed.

const SKIPPED = /^(node_modules|\.git|\.hg|dist|build|target|\.next|\.turbo|\.cache)$/

/**
 * Watches a project folder for the design canvas's change counter. Bun ignores `recursive` when the process already
 * watches the same path non-recursively (the server watches project roots), so each top-level subfolder gets its own
 * recursive watch and the root a plain one. Windows reports transient errors (for example while git rewrites files),
 * so a failed watch reopens. Recursive watching needs Windows or macOS; elsewhere frames reload when reopened.
 */
export function watchProject(root: string, onChange: (file: string) => void) {
  const watchers = new Map<string, FSWatcher>()
  let closed = false

  const open = (name: string | undefined) => {
    if (closed || watchers.has(name ?? "")) return
    const target = name ? path.join(root, name) : root

    try {
      const watcher = watchFolder(target, { recursive: !!name }, (_event, file) => {
        const relative = name ? path.join(name, String(file ?? "")) : String(file ?? "")

        if (!name && file && !SKIPPED.test(String(file)) && statSync(path.join(root, String(file)), { throwIfNoEntry: false })?.isDirectory())
          open(String(file))
        onChange(relative)
      })
      watcher.on("error", () => {
        watcher.close()
        watchers.delete(name ?? "")
        setTimeout(() => open(name), 1000)
      })
      watchers.set(name ?? "", watcher)
    } catch {
      setTimeout(() => open(name), 5000)
    }
  }

  open(undefined)

  for (const entry of readdirSync(root, { withFileTypes: true }))
    if (entry.isDirectory() && !SKIPPED.test(entry.name)) open(entry.name)

  return () => {
    closed = true
    for (const watcher of watchers.values()) watcher.close()
  }
}

export const Plugin = define({
  id: "opencode.design",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.rpc
      .register(Design.Definition, {
        files: ({ directory }) =>
          Effect.sync(() => {
            const root = path.resolve(directory)
            const folder = path.isAbsolute(directory) && statSync(root, { throwIfNoEntry: false })?.isDirectory()

            if (!folder) return ""
            DesignTicket.watch(root, watchProject)

            return `/design/${DesignTicket.issue({ kind: "file", root })}/file`
          }),
        // A root-preserving proxy on its own loopback port, for clients on this machine.
        origin: ({ port }) =>
          Effect.sync(() => (Number.isInteger(port) && port > 0 && port < 65536 ? DesignProxy.liveProxy(port) : "")),
        live: ({ port }) =>
          Effect.sync(() =>
            Number.isInteger(port) && port > 0 && port < 65536
              ? `/design/${DesignTicket.issue({ kind: "live", port })}/live/${port}`
              : "",
          ),
      })
      .pipe(Effect.orDie)
  }),
})
