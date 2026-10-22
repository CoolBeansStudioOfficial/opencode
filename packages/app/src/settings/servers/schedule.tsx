import { Schedule } from "@opencode/schema/schedule"
import { Button } from "@opencode/ui/button"
import { Select } from "@opencode/ui/select"
import { Switch } from "@opencode/ui/switch"
import { TextField } from "@opencode/ui/text-field"
import { createResource, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { ServerConnection } from "@/runtime/server/registry"
import { useGlobal } from "@/runtime/server/runtime"
import { SettingsList } from "@/settings/list"
import { SettingsRow } from "@/settings/row"
import { showToast } from "@/shell/notifications/toast"

// Fork: scheduled tasks on this server. Each run starts a new session in the task's folder with its prompt.
const DAYS = [0, 1, 2, 3, 4, 5, 6]

type Form = { name: string; prompt: string; directory: string; kind: "interval" | "daily"; minutes: string; time: string; days: number[] }

export function ServerScheduleSetting(props: { server: ServerConnection.Any }) {
  const language = useLanguage()
  const global = useGlobal()
  const ctx = () => global.ensureServerCtx(props.server)
  const rpc = () => ctx().sdk.api.rpc(Schedule.Definition)
  const [tasks, { refetch }] = createResource(() => rpc().list({}))
  const [editing, setEditing] = createSignal(false)
  const blank = (): Form => ({
    name: "",
    prompt: "",
    directory: ctx().projects.last() ?? ctx().projects.list()[0]?.worktree ?? "",
    kind: "daily",
    minutes: "60",
    time: "09:00",
    days: [],
  })
  const [form, setForm] = createStore<Form>(blank())

  const fail = (error: Error) =>
    showToast({ variant: "error", title: language.t("common.requestFailed"), description: error.message })

  const list = () => (tasks.state === "ready" || tasks.state === "refreshing" ? tasks.latest : [])

  const weekday = (day: number) => new Date(2026, 9, 18 + day).toLocaleDateString(undefined, { weekday: "short" })

  const describe = (every: Schedule.Every) =>
    every.kind === "interval"
      ? language.t("settings.schedule.everyMinutes", { minutes: every.minutes })
      : every.days.length === 0
        ? language.t("settings.schedule.daily", { time: every.time })
        : language.t("settings.schedule.onDays", { time: every.time, days: every.days.map(weekday).join(", ") })

  const save = async (task: Schedule.Draft) => {
    await rpc().save(task).catch(fail)
    await refetch()
  }

  const create = async () => {
    const every: Schedule.Every =
      form.kind === "interval"
        ? { kind: "interval", minutes: Math.max(1, Number(form.minutes) || 60) }
        : { kind: "daily", time: /^\d{1,2}:\d{2}$/.test(form.time) ? form.time : "09:00", days: [...form.days] }
    await save({ name: form.name, prompt: form.prompt, directory: form.directory, every, enabled: true })
    setForm(blank())
    setEditing(false)
  }

  const toggleDay = (day: number) =>
    setForm("days", (days) => (days.includes(day) ? days.filter((value) => value !== day) : [...days, day].sort()))

  return (
    <section class="settings-section">
      <h3 class="settings-section-title">{language.t("settings.schedule.title")}</h3>
      <SettingsList>
        <For each={list()}>
          {(task) => (
            <SettingsRow
              title={task.name}
              description={`${describe(task.every)} · ${language.t("settings.schedule.next", {
                time: new Date(task.nextRun).toLocaleString(),
              })}`}
            >
              <div class="flex items-center gap-2" data-action="settings-schedule-task">
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() =>
                    void rpc()
                      .run({ id: task.id })
                      .then(() => showToast({ variant: "success", title: language.t("settings.schedule.started") }))
                      .then(() => refetch())
                      .catch(fail)
                  }
                >
                  {language.t("settings.schedule.runNow")}
                </Button>
                <Button
                  size="small"
                  variant="ghost"
                  onClick={() => void rpc().remove({ id: task.id }).then(() => refetch()).catch(fail)}
                >
                  {language.t("common.delete")}
                </Button>
                <Switch checked={task.enabled} onChange={(enabled) => void save({ ...task, enabled })} />
              </div>
            </SettingsRow>
          )}
        </For>
        <Show
          when={editing()}
          fallback={
            <SettingsRow title={language.t("settings.schedule.empty")} description={language.t("settings.schedule.description")}>
              <Button size="small" onClick={() => setEditing(true)}>
                {language.t("settings.schedule.new")}
              </Button>
            </SettingsRow>
          }
        >
          <div class="flex flex-col gap-3 p-3">
            <TextField label={language.t("settings.schedule.name")} value={form.name} onChange={(name) => setForm("name", name)} />
            <TextField
              label={language.t("settings.schedule.prompt")}
              multiline
              value={form.prompt}
              onChange={(prompt) => setForm("prompt", prompt)}
            />
            <TextField
              label={language.t("settings.schedule.folder")}
              value={form.directory}
              onChange={(directory) => setForm("directory", directory)}
            />
            <div class="flex flex-wrap items-end gap-3">
              <Select
                options={["daily", "interval"] as const}
                current={form.kind}
                label={(kind) => language.t(kind === "daily" ? "settings.schedule.kindDaily" : "settings.schedule.kindInterval")}
                onSelect={(kind) => kind && setForm("kind", kind)}
              />
              <Show
                when={form.kind === "daily"}
                fallback={
                  <TextField
                    label={language.t("settings.schedule.minutes")}
                    value={form.minutes}
                    onChange={(minutes) => setForm("minutes", minutes)}
                  />
                }
              >
                <TextField label={language.t("settings.schedule.time")} value={form.time} onChange={(time) => setForm("time", time)} />
              </Show>
            </div>
            <Show when={form.kind === "daily"}>
              <div class="flex flex-wrap gap-1">
                <For each={DAYS}>
                  {(day) => (
                    <Button size="small" variant={form.days.includes(day) ? "neutral" : "ghost"} onClick={() => toggleDay(day)}>
                      {weekday(day)}
                    </Button>
                  )}
                </For>
                <span class="self-center ps-1 text-12-regular text-v2-text-text-muted">
                  {language.t("settings.schedule.daysHint")}
                </span>
              </div>
            </Show>
            <div class="flex gap-2">
              <Button size="small" disabled={!form.prompt.trim() || !form.directory.trim()} onClick={() => void create()}>
                {language.t("settings.schedule.save")}
              </Button>
              <Button size="small" variant="ghost" onClick={() => setEditing(false)}>
                {language.t("common.cancel")}
              </Button>
            </div>
          </div>
        </Show>
      </SettingsList>
    </section>
  )
}
