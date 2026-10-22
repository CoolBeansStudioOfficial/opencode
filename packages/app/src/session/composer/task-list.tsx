import type { SessionMessageInfo } from "@opencode/client/promise"
import { Schema } from "effect"
import { createMemo, createSignal, For, Show } from "solid-js"
import { Icon } from "@opencode/ui/icon"
import { useLanguage } from "@/runtime/i18n/language"
import { useData } from "@/runtime/server/current"

const Todo = Schema.Struct({
  content: Schema.String,
  status: Schema.Literals(["pending", "in_progress", "completed", "cancelled"]),
})

type Todo = typeof Todo.Type

const isTodo = Schema.is(Todo)

// The list from the session's most recent `todowrite` call; each call replaces the whole list.
export function latestTodos(messages: readonly SessionMessageInfo[]): Todo[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]

    if (message?.type !== "assistant") continue

    for (let part = message.content.length - 1; part >= 0; part--) {
      const content = message.content[part]

      if (content?.type !== "tool" || content.name !== "todowrite" || content.state.status === "streaming") continue
      const list = content.state.input.todos

      return Array.isArray(list) ? list.filter(isTodo) : []
    }
  }

  return []
}

// Fork: Claude-style task list pinned above the composer. It shows the agent's latest `todowrite` list while any
// task is still open, and hides once everything is done.
export function SessionTaskList(props: { sessionID: () => string | undefined }) {
  const data = useData()
  const language = useLanguage()
  const [collapsed, setCollapsed] = createSignal(false)

  const todos = createMemo(() => {
    const id = props.sessionID()

    return id ? latestTodos(data.session.message.list(id)) : []
  })

  const open = createMemo(() => todos().some((todo) => todo.status === "pending" || todo.status === "in_progress"))
  const done = createMemo(() => todos().filter((todo) => todo.status === "completed").length)

  return (
    <Show when={open()}>
      <div
        data-component="session-task-list"
        class="mx-auto mb-2 w-full rounded-[10px] border border-v2-border-border-base bg-v2-background-bg-base px-3 py-2"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 text-start text-[12px] leading-4 text-v2-text-text-faint [font-weight:530]"
          aria-expanded={!collapsed()}
          onClick={() => setCollapsed(!collapsed())}
        >
          <Icon name="chevron-down" style={{ transform: collapsed() ? "rotate(-90deg)" : undefined }} />
          <span class="flex-1">{language.t("session.tasks.title")}</span>
          <span>{language.t("session.tasks.progress", { done: done(), total: todos().length })}</span>
        </button>
        <Show when={!collapsed()}>
          <ul class="mt-1.5 flex flex-col gap-1">
            <For each={todos()}>
              {(todo) => (
                <li
                  data-status={todo.status}
                  class="flex items-start gap-2 text-[13px] leading-5"
                  classList={{
                    "text-v2-text-text-base": todo.status === "in_progress",
                    "text-v2-text-text-muted": todo.status === "pending",
                    "text-v2-text-text-faint line-through": todo.status === "completed" || todo.status === "cancelled",
                  }}
                >
                  <span
                    aria-hidden="true"
                    class="mt-[5px] size-2.5 shrink-0 rounded-full border"
                    classList={{
                      "border-v2-text-text-accent bg-v2-text-text-accent": todo.status === "in_progress",
                      "border-v2-text-text-faint": todo.status === "pending",
                      "border-v2-text-text-faint bg-v2-text-text-faint": todo.status === "completed",
                      "border-v2-text-text-faint opacity-50": todo.status === "cancelled",
                    }}
                  />
                  <span class="min-w-0 flex-1" dir="auto">
                    {todo.content}
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </Show>
  )
}
