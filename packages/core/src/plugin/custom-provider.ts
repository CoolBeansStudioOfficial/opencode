export * as CustomProviderPlugin from "./custom-provider.js"

import { define } from "@opencode/plugin/effect/plugin"
import { CustomProvider } from "@opencode/schema/custom-provider"
import { Global } from "@opencode/util/global"
import { Effect } from "effect"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

// Fork: saves a custom OpenAI-compatible provider into the global opencode.json, which the config loader watches and
// reloads, so the provider appears without a restart.
export const Plugin = define({
  id: "opencode.custom-provider",
  effect: Effect.fn(function* (ctx) {
    const global = yield* Global.Service

    yield* ctx.rpc
      .register(CustomProvider.Definition, {
        add: (input) =>
          Effect.sync(() => {
            const file = ["opencode.json", "opencode.jsonc"].map((name) => path.join(global.config, name)).find(existsSync)
              ?? path.join(global.config, "opencode.json")
            const current = existsSync(file) ? readFileSync(file, "utf8") : "{}"
            const config = (() => {
              try {
                return JSON.parse(current) as Record<string, unknown>
              } catch {
                throw new Error(`${file} has comments or invalid JSON; add the provider there by hand`)
              }
            })()
            const providers = (config.provider ?? {}) as Record<string, unknown>

            if (providers[input.providerID]) throw new Error(`Provider "${input.providerID}" already exists in ${file}`)
            providers[input.providerID] = {
              npm: "@ai-sdk/openai-compatible",
              name: input.name,
              options: {
                baseURL: input.baseURL,
                ...(input.apiKey ? { apiKey: input.apiKey } : {}),
                ...(Object.keys(input.headers).length ? { headers: input.headers } : {}),
              },
              models: Object.fromEntries(input.models.map((model) => [model.id, { name: model.name }])),
            }
            config.provider = providers
            mkdirSync(global.config, { recursive: true })
            writeFileSync(file, JSON.stringify(config, null, 2) + "\n")

            return { path: file }
          }),
      })
      .pipe(Effect.orDie)
  }),
})
