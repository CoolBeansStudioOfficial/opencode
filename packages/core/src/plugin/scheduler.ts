export * as SchedulerPlugin from "./scheduler.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Schedule as Task } from "@opencode/schema/schedule"
import { Clock, Duration, Effect, Schedule, Schema } from "effect"
import path from "node:path"
import { AbsolutePath } from "../schema.js"

// Fork: scheduled tasks. Tasks live in plugin storage; a loop checks every 30 seconds and runs each due task by
// creating a session in its folder and sending its prompt. The `schedule` tool lets the agent create tasks.
const PREFIX = "task:"
const decodeTask = Schema.decodeUnknownOption(Task.Task)

/** The first run time strictly after `after` (epoch ms), in the server's local time zone. */
export function nextRun(every: Task.Every, after: number) {
  if (every.kind === "interval") return after + Math.max(1, every.minutes) * 60_000
  const [hours = 9, minutes = 0] = every.time.split(":").map(Number)
  const candidate = new Date(after)
  candidate.setSeconds(0, 0)
  candidate.setHours(hours, minutes)

  for (let day = 0; day < 8; day++) {
    if (candidate.getTime() > after && (every.days.length === 0 || every.days.includes(candidate.getDay())))
      return candidate.getTime()
    candidate.setDate(candidate.getDate() + 1)
    candidate.setHours(hours, minutes)
  }

  return after + 24 * 60 * 60_000
}

export const toolDescription = `Create a scheduled task that runs a prompt automatically in a new session, on an interval or at a time of day. Use it when the user asks for something to happen "every morning", "each hour", "on weekdays at 5pm" and so on. Write the prompt as a complete instruction for a fresh session that has none of this conversation's context. The task runs in the current project's folder. Tasks can be reviewed, paused and deleted in Settings → server → Scheduled tasks.`

export const ToolInput = Schema.Struct({
  name: Schema.String.annotate({ description: "Short name for the task" }),
  prompt: Schema.String.annotate({ description: "The full prompt to send each time the task runs" }),
  every: Task.Every.annotate({
    description:
      'Either {"kind":"interval","minutes":N} or {"kind":"daily","time":"HH:MM","days":[0-6]} (local time; days 0=Sunday, [] means every day)',
  }),
})

export const Plugin = define({
  id: "opencode.scheduler",
  effect: Effect.fn(function* (ctx) {
    const list = Effect.gen(function* () {
      const result = yield* ctx.storage.scan({ prefix: PREFIX, limit: 500 })
      return result.entries.flatMap((entry) => {
        const task = decodeTask(entry.value)
        return task._tag === "Some" ? [task.value] : []
      })
    })

    // RPC output and storage values are JSON, so absent fields are omitted rather than undefined.
    const store = (task: Task.Task) => {
      const { lastRun, lastSessionID, ...rest } = task
      const value = {
        ...rest,
        every: { ...task.every },
        ...(lastRun === undefined ? {} : { lastRun }),
        ...(lastSessionID === undefined ? {} : { lastSessionID }),
      }
      return ctx.storage.set(PREFIX + task.id, value).pipe(Effect.as(value))
    }

    const save = (draft: Task.Draft) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const existing = draft.id ? decodeTask(yield* ctx.storage.get(PREFIX + draft.id)) : undefined
        const previous = existing?._tag === "Some" ? existing.value : undefined
        const scheduleChanged = !previous || JSON.stringify(previous.every) !== JSON.stringify(draft.every)
        return yield* store({
          ...previous,
          id: draft.id ?? crypto.randomUUID(),
          name: draft.name.trim() || "Scheduled task",
          prompt: draft.prompt,
          directory: draft.directory,
          every: draft.every,
          enabled: draft.enabled,
          nextRun: scheduleChanged || !previous ? nextRun(draft.every, now) : previous.nextRun,
        })
      })

    const run = (task: Task.Task) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const session = yield* ctx.session.create({
          location: { directory: AbsolutePath.make(path.resolve(task.directory)) },
          title: task.name,
        })
        yield* ctx.session.prompt({ sessionID: session.id, text: task.prompt })
        yield* store({ ...task, lastRun: now, lastSessionID: session.id, nextRun: nextRun(task.every, now) })
        return session.id
      })

    yield* ctx.rpc
      .register(Task.Definition, {
        list: () => list,
        save: (draft) => save(draft),
        remove: ({ id }) => ctx.storage.remove(PREFIX + id).pipe(Effect.as(true)),
        run: ({ id }) =>
          Effect.gen(function* () {
            const task = decodeTask(yield* ctx.storage.get(PREFIX + id))
            if (task._tag === "None") return ""
            return yield* run(task.value).pipe(Effect.orDie)
          }),
      })
      .pipe(Effect.orDie)

    yield* ctx.tool.transform((editor) =>
      editor.add({
        name: "schedule",
        options: { codemode: false },
        description: toolDescription,
        input: ToolInput,
        execute: (input, context) =>
          Effect.gen(function* () {
            const session = yield* ctx.session.get({ sessionID: context.sessionID }).pipe(Effect.orDie)
            const task = yield* save({ ...input, directory: session.location.directory, enabled: true })
            return {
              content: `Scheduled "${task.name}". Next run: ${new Date(task.nextRun).toLocaleString()}.`,
              metadata: { taskID: task.id, nextRun: task.nextRun },
            }
          }),
      }),
    )

    const due = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis
      const tasks = (yield* list).filter((task) => task.enabled && task.nextRun <= now)
      yield* Effect.forEach(
        tasks,
        (task) =>
          run(task).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("scheduled task failed", { task: task.id, cause }).pipe(
                // Move a failing task to its next slot instead of retrying every tick.
                Effect.andThen(store({ ...task, nextRun: nextRun(task.every, now) })),
              ),
            ),
          ),
        { discard: true },
      )
    }).pipe(Effect.catchCause((cause) => Effect.logWarning("scheduler tick failed", { cause })))

    yield* due.pipe(Effect.repeat(Schedule.spaced(Duration.seconds(30))), Effect.forkScoped({ startImmediately: true }))
  }),
})
