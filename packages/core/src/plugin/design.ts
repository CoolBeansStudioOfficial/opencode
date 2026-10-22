export * as DesignPlugin from "./design.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Design } from "@opencode/schema/design"
import { DesignTicket } from "@opencode/util/design-ticket"
import { Effect } from "effect"
import { statSync, watch as watchFolder } from "node:fs"
import path from "node:path"

// Fork: issues the ticketed URL prefixes design frames load from (see packages/util/src/design-ticket.ts). An empty
// string means the folder or port can't be framed.
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
            DesignTicket.watch(root, (folderRoot, onChange) => {
              // Recursive watching is supported on Windows and macOS; elsewhere frames still reload on demand.
              const watcher = watchFolder(folderRoot, { recursive: true }, (_event, file) => onChange(String(file ?? "")))
              watcher.on("error", () => watcher.close())
              return () => watcher.close()
            })

            return `/design/${DesignTicket.issue({ kind: "file", root })}/file`
          }),
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
