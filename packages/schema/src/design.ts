export * as Design from "./design.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: design frames render real web code through `/design/<ticket>/...` on the server. Signed-in clients get the
// ticketed URL prefix for a project folder or a local dev server port from this RPC.
const portable = Schema.toStandardSchemaV1

export const Definition = Rpc.define({
  id: "opencode.design",
  methods: {
    files: { input: portable(Schema.Struct({ directory: Schema.String })), output: portable(Schema.String) },
    live: { input: portable(Schema.Struct({ port: Schema.Number })), output: portable(Schema.String) },
    // The origin of a root-preserving loopback proxy for the port; only reachable from the server machine.
    origin: { input: portable(Schema.Struct({ port: Schema.Number })), output: portable(Schema.String) },
  },
  events: {},
})
