import { GitActions } from "@opencode/schema/git-actions"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Icon } from "@opencode/ui/icon"
import { Switch } from "@opencode/ui/switch"
import { TextField } from "@opencode/ui/text-field"
import { createResource, createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { usePlatform } from "@/runtime/platform/platform"
import { useServerSDK } from "@/runtime/server/client"
import { showToast } from "@/shell/notifications/toast"

// Fork: Claude-desktop-style git actions for the session's directory: commit, push, open a pull request and watch
// its CI checks. The server runs git and the GitHub CLI (see packages/core/src/plugin/git-actions.ts).
export function SessionGitButton(props: { directory: () => string | undefined }) {
  const dialog = useDialog()
  const language = useLanguage()

  return (
    <Show when={props.directory()}>
      {(directory) => (
        <Button
          size="small"
          variant="ghost"
          data-action="session-git"
          aria-label={language.t("session.git.open")}
          onClick={() => void dialog.show(() => <GitDialog directory={directory()} />)}
        >
          <Icon name="branch-out" />
          {language.t("session.git.button")}
        </Button>
      )}
    </Show>
  )
}

const bucketOrder = { fail: 0, pending: 1, cancel: 2, skipping: 3, pass: 4 } satisfies Record<GitActions.Check["bucket"], number>

function GitDialog(props: { directory: string }) {
  const language = useLanguage()
  const platform = usePlatform()
  const sdk = useServerSDK()
  const rpc = () => sdk.api.rpc(GitActions.Definition)
  const [status, { refetch }] = createResource(() => rpc().status({ directory: props.directory }))
  const [busy, setBusy] = createSignal(false)
  const [form, setForm] = createStore({ message: "", title: "", body: "", draft: false })

  const act = async (action: () => Promise<GitActions.Result>, success: string) => {
    setBusy(true)
    const result = await action().catch((error: Error) => ({ ok: false, output: error.message, url: undefined }))
    setBusy(false)
    showToast({
      variant: result.ok ? "success" : "error",
      title: result.ok ? success : language.t("session.git.failed"),
      description: result.url ?? result.output.split("\n").slice(-3).join("\n"),
    })

    if (result.url) platform.openExternal(result.url)
    await refetch()

    return result.ok
  }

  const loaded = () => (status.state === "ready" || status.state === "refreshing" ? status.latest : undefined)
  const checks = () => [...(loaded()?.checks ?? [])].sort((a, b) => bucketOrder[a.bucket] - bucketOrder[b.bucket])
  const count = (bucket: GitActions.Check["bucket"]) => checks().filter((check) => check.bucket === bucket).length

  return (
    <Dialog size="large">
      <DialogHeader>
        <DialogTitleGroup title={language.t("session.git.title")} description={props.directory} />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-5 px-5">
        <Show when={loaded()} fallback={<span class="text-13-regular text-v2-text-text-muted">{language.t("common.loading")}</span>}>
          {(value) => (
            <Show
              when={value().repository}
              fallback={<span class="text-13-regular text-v2-text-text-muted">{language.t("session.git.notRepository")}</span>}
            >
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-13-regular text-v2-text-text-base">
                <span class="flex items-center gap-1.5">
                  <Icon name="branch-out" />
                  {value().branch ?? "HEAD"}
                </span>
                <span class="text-v2-text-text-muted">
                  {language.t("session.git.sync", { ahead: value().ahead, behind: value().behind })}
                </span>
                <span class="text-v2-text-text-muted">{language.t("session.git.changes", { count: value().changes })}</span>
              </div>

              <section class="flex flex-col gap-2">
                <TextField
                  label={language.t("session.git.commitMessage")}
                  multiline
                  value={form.message}
                  onChange={(message) => setForm("message", message)}
                />
                <div class="flex gap-2">
                  <Button
                    size="small"
                    disabled={busy() || value().changes === 0 || !form.message.trim()}
                    onClick={() =>
                      void act(
                        () => rpc().commit({ directory: props.directory, message: form.message }),
                        language.t("session.git.committed"),
                      ).then((ok) => ok && setForm("message", ""))
                    }
                  >
                    {language.t("session.git.commit")}
                  </Button>
                  <Button
                    size="small"
                    variant="ghost"
                    disabled={busy() || (value().upstream !== undefined && value().ahead === 0)}
                    onClick={() => void act(() => rpc().push({ directory: props.directory }), language.t("session.git.pushed"))}
                  >
                    {language.t("session.git.push")}
                  </Button>
                </div>
              </section>

              <section class="flex flex-col gap-2">
                <h3 class="text-13-medium text-v2-text-text-base">{language.t("session.git.pullRequest")}</h3>
                <Show when={!value().gh}>
                  <span class="text-12-regular text-v2-text-text-muted">{language.t("session.git.noGh")}</span>
                </Show>
                <Show
                  when={value().pr}
                  fallback={
                    <Show when={value().gh}>
                      <TextField
                        label={language.t("session.git.prTitle")}
                        value={form.title}
                        onChange={(title) => setForm("title", title)}
                      />
                      <TextField
                        label={language.t("session.git.prBody")}
                        multiline
                        value={form.body}
                        onChange={(body) => setForm("body", body)}
                      />
                      <div class="flex items-center gap-3">
                        <Button
                          size="small"
                          disabled={busy() || !form.title.trim() || !value().upstream || value().ahead > 0}
                          onClick={() =>
                            void act(
                              () =>
                                rpc().createPR({
                                  directory: props.directory,
                                  title: form.title,
                                  body: form.body,
                                  draft: form.draft,
                                }),
                              language.t("session.git.prCreated"),
                            )
                          }
                        >
                          {language.t("session.git.createPr")}
                        </Button>
                        <label class="flex items-center gap-2 text-12-regular text-v2-text-text-muted">
                          <Switch checked={form.draft} onChange={(draft) => setForm("draft", draft)} />
                          {language.t("session.git.draft")}
                        </label>
                      </div>
                      <Show when={!value().upstream || value().ahead > 0}>
                        <span class="text-12-regular text-v2-text-text-muted">{language.t("session.git.pushFirst")}</span>
                      </Show>
                    </Show>
                  }
                >
                  {(pr) => (
                    <div class="flex flex-col gap-2">
                      <button
                        type="button"
                        class="text-start text-13-medium text-v2-text-text-accent hover:underline"
                        onClick={() => platform.openExternal(pr().url)}
                      >
                        #{pr().number} {pr().title} · {pr().state.toLowerCase()}
                      </button>
                      <Show when={checks().length > 0}>
                        <span class="text-12-regular text-v2-text-text-muted">
                          {language.t("session.git.checks", {
                            pass: count("pass"),
                            fail: count("fail"),
                            pending: count("pending"),
                          })}
                        </span>
                        <ul class="flex max-h-48 flex-col gap-1 overflow-auto">
                          <For each={checks()}>
                            {(check) => (
                              <li class="flex items-center gap-2 text-12-regular">
                                <span
                                  aria-hidden="true"
                                  class="size-2 shrink-0 rounded-full"
                                  classList={{
                                    "bg-[var(--v2-green-500)]": check.bucket === "pass",
                                    "bg-[var(--v2-red-500)]": check.bucket === "fail",
                                    "bg-[var(--v2-yellow-500)]": check.bucket === "pending",
                                    "bg-v2-text-text-faint": check.bucket === "skipping" || check.bucket === "cancel",
                                  }}
                                />
                                <span class="min-w-0 flex-1 truncate text-v2-text-text-base">{check.name}</span>
                                <span class="text-v2-text-text-muted">{check.bucket}</span>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                    </div>
                  )}
                </Show>
              </section>
            </Show>
          )}
        </Show>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" disabled={busy() || status.loading} onClick={() => void refetch()}>
          {language.t("session.git.refresh")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
