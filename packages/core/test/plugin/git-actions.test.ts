import { describe, expect, test } from "bun:test"
import { GitActionsPlugin } from "@opencode/core/plugin/git-actions"

describe("repositoryName", () => {
  test.each([
    ["https://github.com/owner/name.git", "owner/name"],
    ["https://github.com/owner/name", "owner/name"],
    ["git@github.com:owner/name.git", "owner/name"],
    ["ssh://git@github.com/owner/name.git/", "owner/name"],
    ["https://gitlab.com/owner/name.git", undefined],
  ])("%s -> %s", (remote, expected) => {
    expect(GitActionsPlugin.repositoryName(remote)).toBe(expected)
  })
})
