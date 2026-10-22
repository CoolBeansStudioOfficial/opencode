import { lastAssistantWithUsage } from "@opencode/client/solid"
import { ProgressCircle } from "@opencode/ui/progress-circle"
import { createMemo } from "solid-js"
import { useServer } from "@/runtime/server/current"

// Share of the model's context window used by the last assistant step; undefined until a step reports usage and the
// model's limit is known.
export function useSessionContext(sessionID: () => string, directory: () => string | undefined) {
  const server = useServer()

  return createMemo(() => {
    const session = server.ctx.data.session
    const message = lastAssistantWithUsage(session.message.list(sessionID()), session.get(sessionID())?.revert?.messageID)

    if (!message) return
    const ref = directory() ? { directory: directory()! } : undefined
    const model = server.ctx.data.location.model
      .list(ref)
      ?.findLast((item) => item.providerID === message.model.providerID && item.id === message.model.id)
    const total =
      message.tokens.input +
      message.tokens.output +
      message.tokens.reasoning +
      message.tokens.cache.read +
      message.tokens.cache.write

    return model?.limit.context ? Math.min(100, Math.round((total / model.limit.context) * 100)) : undefined
  })
}

// Claude desktop's usage ring at the right of the controls under the composer.
export function SessionContextRing(props: { sessionID: string; directory?: string }) {
  const usage = useSessionContext(
    () => props.sessionID,
    () => props.directory,
  )

  return (
    <div data-slot="context-ring" class="pointer-events-none absolute bottom-1.5 end-3 flex h-6 items-center">
      <ProgressCircle
        appearance="indicator"
        size={16}
        strokeWidth={2}
        percentage={usage() ?? 0}
        style={{
          "--progress-circle-background": "var(--v2-background-bg-layer-04)",
          "--progress-circle-progress": "var(--v2-text-text-accent)",
        }}
      />
    </div>
  )
}
