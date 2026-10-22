import { describe, expect, test } from "bun:test"
import { PermissionModePlugin } from "@opencode/core/plugin/permission-mode"

const { decide } = PermissionModePlugin

describe("permission mode", () => {
  test.each([
    // mode, action, resources, configured effect, expected
    ["default", "edit", ["a.ts"], "ask", "ask"],
    ["default", "shell", ["ls"], "allow", "allow"],
    ["acceptEdits", "edit", ["a.ts"], "ask", "allow"],
    ["acceptEdits", "shell", ["ls"], "ask", "ask"],
    ["plan", "edit", ["a.ts"], "ask", "ask"],
    ["auto", "shell", ["bun test"], "ask", "allow"],
    ["auto", "shell", ["bun test", "rm -rf build"], "allow", "ask"],
    ["auto", "shell", ["git push --force origin dev"], "allow", "ask"],
    ["auto", "read", [".env"], "ask", "ask"],
    ["auto", "external_directory", ["/etc"], "ask", "ask"],
    ["auto", "edit", ["a.ts"], "ask", "allow"],
    ["bypass", "shell", ["rm -rf build"], "ask", "allow"],
    ["bypass", "edit", ["a.ts"], "deny", "deny"],
    ["auto", "edit", ["a.ts"], "deny", "deny"],
  ] as const)("%s %s %p (%s) -> %s", (mode, action, resources, effect, expected) => {
    expect(decide(mode, action, resources, effect)).toBe(expected)
  })
})
