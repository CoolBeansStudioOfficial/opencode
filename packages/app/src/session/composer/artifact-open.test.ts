import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { newArtifacts } from "./artifact-open"

const artifact = (id: string, completed: number, path?: string) => ({
  type: "tool",
  id,
  name: "artifact",
  state: { status: "completed", input: { path }, content: [], metadata: path ? { path } : {} },
  time: { created: completed - 1, completed },
})

const messages = [
  {
    id: "msg_1",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [artifact("old", 100, "/p/old.html"), artifact("new", 200, "/p/new.html"), artifact("bad", 300)],
    time: { created: 1 },
  },
] as unknown as SessionMessageInfo[]

describe("newArtifacts", () => {
  test("keeps artifact calls that finished since the view mounted and carry a path", () => {
    expect(newArtifacts(messages, 150)).toEqual([{ id: "new", path: "/p/new.html" }])
  })
})
