export * as Artifacts from "./artifacts.js"

import { Schema } from "effect"
import { Rpc } from "./rpc.js"

// Fork: the artifact registry. The `artifact` tool, the New artifact dialog and the file list record artifacts here so
// the Artifacts page can list them with their history. Directories are passed explicitly, like git-actions.
const portable = Schema.toStandardSchemaV1

export const Kind = Schema.Literals(["html", "markdown", "slides", "svg", "csv", "pdf", "image", "design"])
export type Kind = typeof Kind.Type

export const Entry = Schema.Struct({
  id: Schema.String,
  path: Schema.String,
  title: Schema.String,
  kind: Kind,
  directory: Schema.String,
  sessionID: Schema.optional(Schema.String),
  created: Schema.Number,
  updated: Schema.Number,
  versions: Schema.Number,
  // True when the file no longer exists on disk.
  missing: Schema.Boolean,
})
export interface Entry extends Schema.Schema.Type<typeof Entry> {}

export const Version = Schema.Struct({ n: Schema.Number, time: Schema.Number, bytes: Schema.Number })
export interface Version extends Schema.Schema.Type<typeof Version> {}

export const Detected = Schema.Struct({
  entry: Entry,
  frames: Schema.Number,
  // Where the generated manifest was written, relative to the project folder.
  file: Schema.String,
})
export interface Detected extends Schema.Schema.Type<typeof Detected> {}

export const Definition = Rpc.define({
  id: "opencode.artifacts",
  methods: {
    list: { input: portable(Schema.Struct({})), output: portable(Schema.Array(Entry)) },
    // Registers a file (for example one opened from the file list). Absent when it is not a viewable file.
    record: {
      input: portable(
        Schema.Struct({
          path: Schema.String,
          directory: Schema.String,
          title: Schema.optional(Schema.String),
          sessionID: Schema.optional(Schema.String),
        }),
      ),
      output: portable(Schema.NullOr(Entry)),
    },
    create: {
      input: portable(
        Schema.Struct({
          directory: Schema.String,
          kind: Kind,
          name: Schema.String,
          // Relative to the directory; defaults to "artifacts".
          folder: Schema.optional(Schema.String),
          sessionID: Schema.optional(Schema.String),
        }),
      ),
      output: portable(Entry),
    },
    // Removes the registry entry and its history; the file stays on disk.
    remove: { input: portable(Schema.Struct({ id: Schema.String })), output: portable(Schema.Boolean) },
    history: { input: portable(Schema.Struct({ id: Schema.String })), output: portable(Schema.Array(Version)) },
    restore: {
      input: portable(Schema.Struct({ id: Schema.String, n: Schema.Number })),
      output: portable(Schema.NullOr(Entry)),
    },
    // Writes a design.json for an existing web project, from its pages or routes and/or a dev-server URL.
    detect: {
      input: portable(Schema.Struct({ directory: Schema.String, url: Schema.optional(Schema.String) })),
      output: portable(Detected),
    },
  },
  events: {},
})
