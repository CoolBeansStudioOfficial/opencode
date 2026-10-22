export * as CompactFocusPlugin from "./compact-focus.js"

import { SystemPart } from "@opencode/ai"
import { define } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"

// Fork: `/compact <focus>` stores a focus hint in session metadata; the next compaction adds it to the summary
// instructions and then clears it, like Claude Code's `/compact` with instructions.
export const metadataKey = "compactFocus"

const isFocus = Schema.is(Schema.NonEmptyString)

export const instruction = (focus: string) =>
  `The user asked this summary to focus on: ${focus.trim()}\nKeep everything needed to continue that work in detail, and summarize the rest briefly.`

export const Plugin = define({
  id: "opencode.compact-focus",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.session.hook("compaction", (event) =>
      Effect.gen(function* () {
        const session = yield* ctx.session.get({ sessionID: event.sessionID }).pipe(Effect.option)

        if (session._tag === "None") return
        const metadata = session.value.metadata ?? {}
        const focus = metadata[metadataKey]

        if (!isFocus(focus) || !focus.trim()) return
        event.system.push(SystemPart.make(instruction(focus)))
        const { [metadataKey]: _, ...rest } = metadata
        yield* ctx.session.update({ sessionID: event.sessionID, metadata: rest }).pipe(Effect.ignore)
      }),
    )
  }),
})
