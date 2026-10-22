import { useParams } from "@solidjs/router"
import { Schema } from "effect"
import { createMemo } from "solid-js"
import { useLocal } from "@/providers/models/selection"
import { useLanguage } from "@/runtime/i18n/language"
import { Persist, persisted } from "@/runtime/persistence/storage"
import { useServerSDK } from "@/runtime/server/client"
import { useData } from "@/runtime/server/current"
import { showToast } from "@/shell/notifications/toast"

// Fork: Claude-style permission modes. Core's permission-mode plugin enforces the mode stored in session
// metadata under this key; keep the two lists in sync.
export const permissionModeKey = "permissionMode"

export const permissionModes = ["default", "acceptEdits", "plan", "auto", "bypass"] as const

export type PermissionMode = (typeof permissionModes)[number]

const PermissionModeValue = Schema.Literals(permissionModes)

export const isPermissionMode = Schema.is(PermissionModeValue)

const PermissionModeSchema = Schema.Struct({ mode: PermissionModeValue })

// New sessions start in the last mode the user picked, as in Claude.
export function usePermissionModeDraft() {
  const [draft, setDraft] = persisted(Persist.global("permission-mode"), PermissionModeSchema, { mode: "default" })

  return { mode: () => draft.mode, set: (mode: PermissionMode) => setDraft({ mode }) }
}

export function usePermissionMode() {
  const params = useParams()
  const data = useData()
  const serverSDK = useServerSDK()
  const local = useLocal()
  const language = useLanguage()
  const draft = usePermissionModeDraft()

  const session = createMemo(() => (params.id ? data.session.get(params.id) : undefined))

  const current = createMemo((): PermissionMode => {
    const info = session()

    if (!info) return draft.mode()
    const mode = info.metadata?.[permissionModeKey]

    return isPermissionMode(mode) ? mode : "default"
  })

  const set = (mode: PermissionMode) => {
    const previous = current()
    draft.set(mode)

    // Plan mode is the Plan agent; leaving it returns to Build. The agent switch commits with the next prompt.
    if (mode === "plan") local.agent.set("plan")
    else if (previous === "plan" && local.agent.current()?.name === "plan") local.agent.set("build")

    const info = session()

    if (!info) return
    void serverSDK.api.session
      .update({ sessionID: info.id, metadata: { ...info.metadata, [permissionModeKey]: mode } })
      .catch((error: Error) =>
        showToast({ variant: "error", title: language.t("common.requestFailed"), description: error.message }),
      )
  }

  const cycle = () => set(permissionModes[(permissionModes.indexOf(current()) + 1) % permissionModes.length])

  const label = (mode: PermissionMode) => language.t(`composer.permissionMode.${mode}`)

  return { current, set, cycle, label }
}
