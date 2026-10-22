export * as CustomProvider from "./custom-provider.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: custom OpenAI-compatible providers. V2 has no config-write API, so the server merges the provider into the
// global opencode.json itself.
const portable = Schema.toStandardSchemaV1

export const Input = Schema.Struct({
  providerID: Schema.String,
  name: Schema.String,
  baseURL: Schema.String,
  apiKey: Schema.optional(Schema.String),
  headers: Schema.Record(Schema.String, Schema.String),
  models: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
})
export type Input = typeof Input.Type

export const Definition = Rpc.define({
  id: "opencode.custom-provider",
  methods: {
    add: { input: portable(Input), output: portable(Schema.Struct({ path: Schema.String })) },
  },
  events: {},
})
