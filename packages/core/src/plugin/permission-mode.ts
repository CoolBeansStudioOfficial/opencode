export * as PermissionModePlugin from "./permission-mode.js"

import { define } from "@opencode/plugin/effect/plugin"
import type { Permission } from "@opencode/schema/permission"
import { Effect } from "effect"
import { Wildcard } from "../util/wildcard.js"

// Fork: Claude-style permission modes. The mode lives in session metadata so every client (desktop,
// phone, TUI) sees and enforces the same one, and child sessions inherit it. Deny rules are applied
// before this hook runs, so no mode can override a deny.
export const metadataKey = "permissionMode"

export const modes = ["default", "acceptEdits", "plan", "auto", "bypass"] as const
export type Mode = (typeof modes)[number]

export const isMode = (value: unknown): value is Mode => modes.includes(value as Mode)

// Shell commands that still need approval in auto mode, even when config allows them.
export const risky = [
  "rm -rf *",
  "rm -fr *",
  "rm -r *",
  "sudo *",
  "git push --force*",
  "git push -f*",
  "git reset --hard*",
  "git clean -f*",
  "git checkout -- *",
  "chmod -R *",
  "chown -R *",
  "dd *",
  "mkfs*",
  "shutdown*",
  "reboot*",
  "Remove-Item * -Recurse*",
  "rd /s *",
  "rmdir /s *",
  "del /s *",
  "format *",
]

// Actions auto mode leaves to the configured rules: secrets (`read` asks for `.env` files) and paths outside the project.
const guarded = new Set(["read", "external_directory"])

export function decide(mode: Mode, action: string, resources: ReadonlyArray<string>, effect: Permission.Effect) {
  if (effect === "deny") return effect
  if (mode === "bypass") return "allow"
  if (mode === "acceptEdits") return action === "edit" ? "allow" : effect
  if (mode !== "auto") return effect
  if (action === "shell" && resources.some((command) => risky.some((pattern) => Wildcard.match(command, pattern))))
    return "ask"
  return guarded.has(action) ? effect : "allow"
}

export const Plugin = define({
  id: "opencode.permission-mode",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.permission.hook("evaluate", (event) =>
      Effect.gen(function* () {
        const session = yield* ctx.session.get({ sessionID: event.sessionID }).pipe(Effect.option)
        const mode = session._tag === "Some" ? session.value.metadata?.[metadataKey] : undefined
        if (!isMode(mode)) return
        event.effect = decide(mode, event.action, event.resources, event.effect)
      }),
    )
  }),
})
