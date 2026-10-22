import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitleGroup } from "@opencode/ui/dialog"
import { Select } from "@opencode/ui/select"
import { TextField } from "@opencode/ui/text-field"
import { createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import type { ArtifactsController } from "./controller"
import { projectName } from "./kinds"

// Fork: turns an existing web project into a Design artifact. The server finds its pages or routes and writes a
// design.json next to the code (never over an existing one); nothing is started for you.
export function DesignFromProjectDialog(props: { controller: ArtifactsController }) {
  const language = useLanguage()
  const dialog = useDialog()
  const [busy, setBusy] = createSignal(false)
  const [form, setForm] = createStore({ directory: "", url: "" })

  // The server's folders may load after the dialog opens, so an unchosen project means the first one.
  const directory = () => form.directory || props.controller.projects()[0] || ""

  const submit = async () => {
    if (busy() || !directory()) return
    setBusy(true)
    const result = await props.controller.designFromProject({ ...form, directory: directory() }).finally(() => setBusy(false))
    if (result) dialog.close()
  }

  return (
    <Dialog size="large">
      <DialogHeader>
        <DialogTitleGroup
          title={language.t("artifacts.fromProject.title")}
          description={language.t("artifacts.fromProject.description")}
        />
      </DialogHeader>
      <DialogBody class="flex flex-col gap-4 px-5">
        <label class="flex flex-col gap-1 text-12-regular text-v2-text-text-muted">
          {language.t("artifacts.field.project")}
          <Select
            options={props.controller.projects()}
            current={directory()}
            label={projectName}
            onSelect={(directory) => directory && setForm("directory", directory)}
          />
        </label>
        <TextField
          label={language.t("artifacts.fromProject.url")}
          placeholder="http://localhost:5173"
          value={form.url}
          onChange={(url) => setForm("url", url)}
        />
        <span class="text-12-regular text-v2-text-text-muted">{language.t("artifacts.fromProject.hint")}</span>
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </Button>
        <Button disabled={busy() || !directory()} data-action="design-from-project" onClick={() => void submit()}>
          {language.t("artifacts.fromProject.create")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
