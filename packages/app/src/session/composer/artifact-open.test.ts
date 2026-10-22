import { describe, expect, test } from "bun:test"
import type { SessionMessageAssistant, SessionMessageAssistantTool } from "@opencode/client/promise"
import { newArtifacts } from "./artifact-open"

const artifact = (id: string, completed: number, path?: string): SessionMessageAssistantTool => ({
  type: "tool",
  id,
  name: "artifact",
  state: {
    status: "completed",
    input: path ? { path } : {},
    content: [{ type: "text", text: "" }],
    metadata: path ? { path } : {},
  },
  time: { created: completed - 1, completed },
})

const messages: SessionMessageAssistant[] = [
  {
    id: "msg_1",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [artifact("old", 100, "/p/old.html"), artifact("new", 200, "/p/new.html"), artifact("bad", 300)],
    time: { created: 1 },
  },
]

describe("newArtifacts", () => {
  test("keeps artifact calls that finished since the view mounted and carry a path", () => {
    expect(newArtifacts(messages, 150)).toEqual([{ id: "new", path: "/p/new.html" }])
  })
})
