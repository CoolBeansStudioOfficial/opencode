export * as MemoryPlugin from "./memory.js"

import { SystemPart } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import type { SessionHooks } from "@opencode/plugin/effect/session"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

// Fork: Claude-style persistent memory. One folder in the global config directory holds a memory per file plus a
// MEMORY.md index; the index is injected into every session, and the agent may read and write the folder without
// approval prompts.
const INDEX = "MEMORY.md"
const MAX_INDEX = 12_000

const slash = (value: string) => value.replaceAll("\\", "/")

export const instructions = (directory: string, index: string) => `<memory>
You have a persistent memory at ${directory}, shared by every session and project on this machine. Each memory is one Markdown file; ${INDEX} is the index, one line per memory: "- [Title](file.md) — hook".

Save a memory when you learn something that will matter in a later session: the user's preferences, corrections to how you work, ongoing project context that isn't in the code, or pointers to external resources. Don't save what the repository already records or what only matters to this conversation. Write the file, then add its line to ${INDEX}. Update or delete a memory that turns out wrong instead of adding a duplicate. When the user asks you to remember or forget something, do it here.

${index.trim() ? `Current ${INDEX}:\n${index.trim()}` : `${INDEX} is empty.`}
</memory>`

export const Plugin = define({
  id: "opencode.memory",
  effect: Effect.fn(function* (ctx) {
    const global = yield* Global.Service
    const directory = path.join(global.config, "memory")
    yield* Effect.sync(() => mkdirSync(directory, { recursive: true }))
    const pattern = slash(path.join(directory, "*"))

    yield* ctx.agent.transform((editor) => {
      for (const agent of editor.list()) {
        editor.update(agent.id, (item) => {
          item.permissions.push({ action: "external_directory", resource: pattern, effect: "allow" })
          item.permissions.push({ action: "read", resource: pattern, effect: "allow" })
          // Read-only subagents such as explore can consult memory but not change it.
          if (item.mode !== "subagent") item.permissions.push({ action: "edit", resource: pattern, effect: "allow" })
        })
      }
    })

    const index = () => {
      try {
        return readFileSync(path.join(directory, INDEX), "utf8").slice(0, MAX_INDEX)
      } catch {
        return ""
      }
    }

    const hook = (event: SessionHooks["context"]) =>
      Effect.sync(() => {
        event.system.push(SystemPart.make(instructions(slash(directory), index())))
      })
    yield* ctx.session.hook("context", hook)
    yield* ctx.session.hook("compaction", hook)
  }),
})
