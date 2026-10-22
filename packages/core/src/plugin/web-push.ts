export * as WebPushPlugin from "./web-push.js"

import { define } from "@opencode/plugin/effect/plugin"
import { Push } from "@opencode/schema/push"
import { Effect, Schema, Stream } from "effect"
import webpush from "web-push"

// Fork: web push. Devices subscribe through the `opencode.push` RPC; this plugin pushes to every subscription when a
// root session finishes or fails, or when any session waits on a permission or a question. Keys and subscriptions
// live in plugin storage, which every location shares, and are always re-read so all locations use the same keys.
const KEYS = "vapid"
const SUBSCRIPTION = "subscription:"

const Keys = Schema.Struct({ publicKey: Schema.String, privateKey: Schema.String })
const decodeKeys = Schema.decodeUnknownOption(Keys)
const decodeSubscription = Schema.decodeUnknownOption(Push.Subscription)

// Push services reject subscriptions they no longer know with 404 or 410.
const gone = (error: unknown) =>
  typeof error === "object" && error !== null && [404, 410].includes((error as { statusCode?: number }).statusCode ?? 0)

const subscriptionKey = (endpoint: string) => SUBSCRIPTION + new Bun.CryptoHasher("sha256").update(endpoint).digest("hex")

export const Plugin = define({
  id: "opencode.web-push",
  effect: Effect.fn(function* (ctx) {
    const keys = Effect.gen(function* () {
      const stored = decodeKeys(yield* ctx.storage.get(KEYS))
      if (stored._tag === "Some") return stored.value
      const created = webpush.generateVAPIDKeys()
      yield* ctx.storage.set(KEYS, { publicKey: created.publicKey, privateKey: created.privateKey })
      // A concurrent location may have written first; use whichever key the store kept.
      const kept = decodeKeys(yield* ctx.storage.get(KEYS))
      return kept._tag === "Some" ? kept.value : created
    })

    const subscriptions = Effect.gen(function* () {
      const result = yield* ctx.storage.scan({ prefix: SUBSCRIPTION, limit: 500 })
      return result.entries.flatMap((entry) => {
        const decoded = decodeSubscription(entry.value)
        return decoded._tag === "Some" ? [{ key: entry.key, subscription: decoded.value }] : []
      })
    })

    const send = (subscription: Push.Subscription, payload: Push.Payload, vapid: Schema.Schema.Type<typeof Keys>) =>
      Effect.tryPromise(() =>
        webpush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: 60 * 60,
          urgency: payload.kind === "permission" || payload.kind === "question" ? "high" : "normal",
          vapidDetails: { subject: "mailto:noreply@opencode.local", ...vapid },
        }),
      )

    const broadcast = (payload: Push.Payload) =>
      Effect.gen(function* () {
        const vapid = yield* keys
        const targets = yield* subscriptions
        yield* Effect.forEach(
          targets,
          (target) =>
            send(target.subscription, payload, vapid).pipe(
              Effect.catch((cause) =>
                gone(cause.cause) ? ctx.storage.remove(target.key) : Effect.logDebug("web push failed", { cause }),
              ),
            ),
          { concurrency: 4, discard: true },
        )
      }).pipe(Effect.catchCause((cause) => Effect.logWarning("web push broadcast failed", { cause })))

    yield* ctx.rpc.register(Push.Definition, {
      key: () => keys.pipe(Effect.map((value) => value.publicKey)),
      subscribe: (subscription) =>
        ctx.storage.set(subscriptionKey(subscription.endpoint), subscription).pipe(Effect.as(true)),
      unsubscribe: ({ endpoint }) => ctx.storage.remove(subscriptionKey(endpoint)).pipe(Effect.as(true)),
      test: ({ endpoint }) =>
        Effect.gen(function* () {
          const stored = decodeSubscription(yield* ctx.storage.get(subscriptionKey(endpoint)))
          if (stored._tag === "None") return false
          return yield* send(
            stored.value,
            { kind: "test", title: "OpenCode", body: "Notifications from this server are working." },
            yield* keys,
          ).pipe(
            Effect.as(true),
            Effect.catch(() => Effect.succeed(false)),
          )
        }),
    }).pipe(Effect.orDie)

    const session = (sessionID: string) =>
      ctx.session.get({ sessionID: sessionID as never }).pipe(Effect.option, Effect.map((value) => value._tag === "Some" ? value.value : undefined))

    const label = (title: string | undefined) => title?.trim() || "Session"

    yield* ctx.event.subscribe().pipe(
      Stream.runForEach((event) =>
        Effect.gen(function* () {
          if (event.type === "session.execution.succeeded" || event.type === "session.execution.failed") {
            const info = yield* session(event.data.sessionID)
            // Subagent sessions report to their parent; only root sessions notify.
            if (!info || info.parentID) return
            const failed = event.type === "session.execution.failed"
            yield* broadcast({
              kind: failed ? "failed" : "finished",
              title: label(info.title),
              body: failed ? "The agent stopped with an error." : "The agent finished.",
              sessionID: info.id,
              directory: info.location.directory,
            })
            return
          }
          if (event.type === "permission.asked") {
            const info = yield* session(event.data.sessionID)
            yield* broadcast({
              kind: "permission",
              title: label(info?.title),
              body: `Approval needed: ${event.data.action} ${event.data.resources.slice(0, 2).join(", ")}`.trim(),
              sessionID: event.data.sessionID,
              directory: info?.location.directory,
            })
            return
          }
          if (event.type === "form.created") {
            const info = yield* session(event.data.form.sessionID)
            yield* broadcast({
              kind: "question",
              title: label(info?.title),
              body: event.data.form.fields[0]?.description ?? event.data.form.title,
              sessionID: event.data.form.sessionID,
              directory: info?.location.directory,
            })
          }
        }).pipe(Effect.catchCause((cause) => Effect.logWarning("web push event failed", { cause }))),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
  }),
})
