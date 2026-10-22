export * as Push from "./push.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: web push for phones and other devices. The server holds the VAPID keys and the device subscriptions, and
// pushes when a session finishes, fails or needs an answer.
export const Subscription = Schema.Struct({
  endpoint: Schema.String.check(Schema.isMaxLength(2_048)),
  keys: Schema.Struct({
    p256dh: Schema.String.check(Schema.isMaxLength(256)),
    auth: Schema.String.check(Schema.isMaxLength(256)),
  }),
}).annotate({ identifier: "Push.Subscription" })
export interface Subscription extends Schema.Schema.Type<typeof Subscription> {}

// Standard Schema form so the browser client and the server share one definition.
const portable = Schema.toStandardSchemaV1
const Endpoint = Schema.Struct({ endpoint: Schema.String })

export const Definition = Rpc.define({
  id: "opencode.push",
  methods: {
    key: { input: portable(Schema.Struct({})), output: portable(Schema.String) },
    subscribe: { input: portable(Subscription), output: portable(Schema.Boolean) },
    unsubscribe: { input: portable(Endpoint), output: portable(Schema.Boolean) },
    test: { input: portable(Endpoint), output: portable(Schema.Boolean) },
  },
  events: {},
})

// What the service worker receives.
export const Payload = Schema.Struct({
  title: Schema.String,
  body: Schema.String,
  sessionID: Schema.optional(Schema.String),
  directory: Schema.optional(Schema.String),
  kind: Schema.Literals(["finished", "failed", "permission", "question", "test"]),
})
export interface Payload extends Schema.Schema.Type<typeof Payload> {}
