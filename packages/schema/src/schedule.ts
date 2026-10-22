export * as Schedule from "./schedule.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: scheduled tasks. The server starts a new session in the task's folder and sends its prompt each time the
// task is due, like Claude's scheduled tasks.
const portable = Schema.toStandardSchemaV1

export const Every = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("interval"), minutes: Schema.Number }),
  // Local time "HH:MM"; days are 0 (Sunday) to 6, empty meaning every day.
  Schema.Struct({ kind: Schema.Literal("daily"), time: Schema.String, days: Schema.Array(Schema.Number) }),
])
export type Every = typeof Every.Type

export const Task = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  prompt: Schema.String,
  directory: Schema.String,
  every: Every,
  enabled: Schema.Boolean,
  nextRun: Schema.Number,
  lastRun: Schema.optional(Schema.Number),
  lastSessionID: Schema.optional(Schema.String),
})
export interface Task extends Schema.Schema.Type<typeof Task> {}

export const Draft = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String,
  prompt: Schema.String,
  directory: Schema.String,
  every: Every,
  enabled: Schema.Boolean,
})
export interface Draft extends Schema.Schema.Type<typeof Draft> {}

export const Definition = Rpc.define({
  id: "opencode.schedule",
  methods: {
    list: { input: portable(Schema.Struct({})), output: portable(Schema.Array(Task)) },
    save: { input: portable(Draft), output: portable(Task) },
    remove: { input: portable(Schema.Struct({ id: Schema.String })), output: portable(Schema.Boolean) },
    run: { input: portable(Schema.Struct({ id: Schema.String })), output: portable(Schema.String) },
  },
  events: {},
})
