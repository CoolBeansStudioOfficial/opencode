import type { Artifacts } from "@opencode/schema/artifacts"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Select } from "@opencode/ui/select"
import { TextField } from "@opencode/ui/text-field"
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import type { ArtifactsController } from "./controller"
import { KINDS, kindLabelKey, projectName } from "./kinds"

// Fork: the New artifact dialog. Creates a starter file in the chosen project folder; with a prompt it then opens a
// chat that builds it out.
export function NewArtifactDialog(props: { controller: ArtifactsController; kind?: Artifacts.Kind }) {
  const language = useLanguage()
  const dialog = useDialog()
  const projects = props.controller.projects
  const [busy, setBusy] = createSignal(false)
  const [form, setForm] = createStore({
    kind: props.kind ?? ("html" as Artifacts.Kind),
    name: "",
    directory: "",
    folder: "artifacts",
    prompt: "",
  })

  // The server's folders may load after the dialog opens, so an unchosen project means the first one.
  const directory = () =>
    form.directory || props.controller.home.project.newSession()?.worktree || projects()[0] || ""

  const submit = async () => {
    if (busy() || !form.name.trim() || !directory()) return
    setBusy(true)
    const entry = await props.controller.create({ ...form, directory: directory() }).finally(() => setBusy(false))
    if (entry) dialog.close()
  }

  return (
    <Dialog size="large">
      <DialogHeader>
        <DialogTitleGroup title={language.t("artifacts.new")} description={language.t("artifacts.newDescription")} />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-5">
        <div class="flex flex-wrap gap-3">
          <label class="flex flex-col gap-1 text-12-regular text-v2-text-text-muted">
            {language.t("artifacts.field.kind")}
            <Select
              options={KINDS}
              current={form.kind}
              label={(kind) => language.t(kindLabelKey(kind))}
              onSelect={(kind) => kind && setForm("kind", kind)}
            />
          </label>
          <label class="flex min-w-0 flex-1 flex-col gap-1 text-12-regular text-v2-text-text-muted">
            {language.t("artifacts.field.project")}
            <Select
              options={projects()}
              current={directory()}
              label={projectName}
              onSelect={(directory) => directory && setForm("directory", directory)}
            />
          </label>
        </div>
        <TextField
          autofocus
          label={language.t("artifacts.field.name")}
          value={form.name}
          onChange={(name) => setForm("name", name)}
        />
        <TextField
          label={language.t("artifacts.field.folder")}
          value={form.folder}
          onChange={(folder) => setForm("folder", folder)}
        />
        <TextField
          multiline
          label={language.t("artifacts.field.prompt")}
          value={form.prompt}
          onChange={(prompt) => setForm("prompt", prompt)}
        />
        <span class="text-12-regular text-v2-text-text-muted">{language.t("artifacts.field.promptHint")}</span>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button disabled={busy() || !form.name.trim() || !directory()} data-action="artifact-create" onClick={() => void submit()}>
          {language.t("artifacts.create")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
