import { Button } from "@opencode/ui/button"
import { Switch } from "@opencode/ui/switch"
import { createResource, createSignal, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import { disablePush, enablePush, pushState, testPush } from "@/runtime/push"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { SettingsRow } from "@/settings/row"
import { showToast } from "@/shell/notifications/toast"

// Fork: per-device web push from this server. Only the browser/PWA build shows it; the desktop app notifies natively.
export function ServerPushSetting(props: { server: ServerConnection.Any }) {
  const language = useLanguage()
  const global = useGlobal()
  const [busy, setBusy] = createSignal(false)
  const [state, { refetch }] = createResource(pushState)

  const api = () => global.ensureServerCtx(props.server).sdk.api

  const fail = (error: Error) =>
    showToast({ variant: "error", title: language.t("common.requestFailed"), description: error.message })

  const toggle = async (checked: boolean) => {
    setBusy(true)
    await (checked ? enablePush(api()) : disablePush(api())).catch(fail)
    await refetch()
    setBusy(false)
  }

  const hint = () => {
    const value = state.latest

    if (value === "unsupported") return language.t("settings.server.push.unsupported")

    if (value === "no-worker") return language.t("settings.server.push.noWorker")

    if (value === "denied") return language.t("settings.server.push.denied")

    return language.t("settings.server.push.description")
  }

  return (
    <SettingsRow title={language.t("settings.server.push.title")} description={hint()}>
      <div class="flex items-center gap-2" data-action="settings-server-push">
        <Show when={state.latest === "on"}>
          <Button
            size="small"
            variant="ghost"
            disabled={busy()}
            onClick={() =>
              void testPush(api())
                .then((sent) => !sent && fail(new Error(language.t("settings.server.push.testFailed"))))
                .catch(fail)
            }
          >
            {language.t("settings.server.push.test")}
          </Button>
        </Show>
        <Switch
          checked={state.latest === "on"}
          disabled={busy() || (state.latest !== "on" && state.latest !== "off")}
          onChange={(checked) => void toggle(checked)}
        />
      </div>
    </SettingsRow>
  )
}
