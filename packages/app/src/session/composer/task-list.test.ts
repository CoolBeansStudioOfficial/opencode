import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { latestTodos } from "./task-list"

const todo = (id: string, todos: unknown, status: "running" | "completed" = "completed") =>
  ({
    type: "tool",
    id,
    name: "todowrite",
    state:
      status === "completed"
        ? { status, input: { todos }, content: [], metadata: {} }
        : { status, input: { todos } },
    time: { created: 1, completed: 2 },
  }) as const

const assistant = (id: string, content: unknown[]) =>
  ({
    id,
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content,
    time: { created: 1 },
  }) as SessionMessageInfo

describe("latestTodos", () => {
  test("returns the most recent todowrite list, skipping malformed items", () => {
    const messages = [
      assistant("msg_1", [todo("t1", [{ content: "Old", status: "pending" }])]),
      { id: "msg_2", type: "user", text: "next", time: { created: 2 } } satisfies SessionMessageInfo,
      assistant("msg_3", [
        todo("t2", [
          { content: "Write tests", status: "in_progress" },
          { content: 7, status: "pending" },
          { content: "Ship", status: "pending" },
        ]),
        { type: "text", text: "working on it" },
      ]),
    ]

    expect(latestTodos(messages)).toEqual([
      { content: "Write tests", status: "in_progress" },
      { content: "Ship", status: "pending" },
    ])
  })

  test("uses a running call and ignores sessions without one", () => {
    expect(latestTodos([assistant("msg_1", [todo("t1", [{ content: "Now", status: "pending" }], "running")])])).toEqual([
      { content: "Now", status: "pending" },
    ])
    expect(latestTodos([assistant("msg_1", [{ type: "text", text: "hi" }])])).toEqual([])
  })
})
