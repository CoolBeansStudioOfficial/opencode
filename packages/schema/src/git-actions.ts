export * as GitActions from "./git-actions.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: commit, push, pull request and CI status for a session's directory, run on the server with git and the
// GitHub CLI (gh). Pull requests always target the `origin` remote's repository.
const portable = Schema.toStandardSchemaV1

export const Check = Schema.Struct({
  name: Schema.String,
  bucket: Schema.Literals(["pass", "fail", "pending", "skipping", "cancel"]),
  link: Schema.optional(Schema.String),
})
export interface Check extends Schema.Schema.Type<typeof Check> {}

export const PullRequest = Schema.Struct({
  number: Schema.Number,
  url: Schema.String,
  state: Schema.String,
  title: Schema.String,
})
export interface PullRequest extends Schema.Schema.Type<typeof PullRequest> {}

export const Status = Schema.Struct({
  repository: Schema.Boolean,
  branch: Schema.optional(Schema.String),
  upstream: Schema.optional(Schema.String),
  ahead: Schema.Number,
  behind: Schema.Number,
  changes: Schema.Number,
  gh: Schema.Boolean,
  pr: Schema.optional(PullRequest),
  checks: Schema.Array(Check),
})
export interface Status extends Schema.Schema.Type<typeof Status> {}

export const Result = Schema.Struct({ ok: Schema.Boolean, output: Schema.String, url: Schema.optional(Schema.String) })
export interface Result extends Schema.Schema.Type<typeof Result> {}

// Every call names the session directory it acts on; plugin RPCs run in the server's own location.
const Directory = { directory: Schema.String }

export const Definition = Rpc.define({
  id: "opencode.git",
  methods: {
    status: { input: portable(Schema.Struct(Directory)), output: portable(Status) },
    commit: { input: portable(Schema.Struct({ ...Directory, message: Schema.String })), output: portable(Result) },
    push: { input: portable(Schema.Struct(Directory)), output: portable(Result) },
    createPR: {
      input: portable(
        Schema.Struct({ ...Directory, title: Schema.String, body: Schema.String, draft: Schema.Boolean }),
      ),
      output: portable(Result),
    },
  },
  events: {},
})
