import type { Artifacts } from "@opencode/schema/artifacts"
import { Button } from "@opencode/ui/button"
import { useDialog } from "@opencode/ui/context/dialog"
import { Icon } from "@opencode/ui/icon"
import { ScrollView } from "@opencode/ui/scroll-view"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/runtime/i18n/language"
import { createArtifactsController, type ArtifactsController } from "./controller"
import { kindLabelKey, projectName } from "./kinds"
import { NewArtifactDialog } from "./new-dialog"
import { ArtifactPreview } from "./preview"

// Fork: Claude-style gallery of every artifact the agent (or you) made, across projects, newest first.
const TEMPLATES = [
  { kind: "markdown", icon: "edit", tint: "from-[#1d2b45] to-[#121a2b]" },
  { kind: "slides", icon: "grid-plus", tint: "from-[#4a3512] to-[#251b0a]" },
  { kind: "design", icon: "select-element", tint: "from-[#2a2a3d] to-[#14141f]" },
  { kind: "html", icon: "code-lines", tint: "from-[#2c2347] to-[#161226]" },
] as const satisfies readonly { kind: Artifacts.Kind; icon: string; tint: string }[]

const TABS = ["all", "html", "markdown", "slides", "design"] as const

const CHIP_ICON = {
  html: "code-lines",
  markdown: "edit",
  slides: "grid-plus",
  svg: "select-element",
  csv: "filetree",
  pdf: "archive",
  image: "outline-eye",
  design: "select-element",
} as const satisfies Record<Artifacts.Kind, string>

export function ArtifactsPage() {
  const language = useLanguage()
  const dialog = useDialog()
  const controller = createArtifactsController()
  const [filter, setFilter] = createStore<{
    query: string
    kind: Artifacts.Kind | "all"
    search: boolean
    list: boolean
    group: "none" | "project"
  }>({ query: "", kind: "all", search: false, list: false, group: "none" })

  const visible = createMemo(() => {
    const query = filter.query.trim().toLowerCase()

    return controller
      .entries()
      .filter(
        (entry) =>
          (filter.kind === "all" || entry.kind === filter.kind) &&
          (!query || `${entry.title} ${entry.path} ${projectName(entry.directory)}`.toLowerCase().includes(query)),
      )
  })

  const groups = createMemo(() => {
    if (filter.group === "none") return [{ name: "", entries: visible() }]
    const byProject = Map.groupBy(visible(), (entry) => projectName(entry.directory))

    return [...byProject].map(([name, entries]) => ({ name, entries }))
  })

  const newArtifact = (kind?: Artifacts.Kind) =>
    void dialog.show(() => <NewArtifactDialog controller={controller} kind={kind} />)

  const iconButton =
    "flex size-8 items-center justify-center rounded-[8px] text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover aria-pressed:bg-v2-background-bg-deep aria-pressed:text-v2-text-text-base"

  return (
    <div
      data-component="artifacts-page"
      class="mx-[var(--shell-inline-inset,8px)] mb-[var(--shell-bottom-inset,8px)] mt-[var(--shell-top-inset,8px)] flex min-h-0 flex-1 flex-col self-stretch overflow-hidden rounded-[10px] bg-v2-background-bg-base shadow-[var(--v2-elevation-raised)]"
    >
      <ScrollView class="min-h-0 flex-1">
        <div class="mx-auto flex w-full max-w-[1130px] flex-col px-6 pb-12 pt-14">
          <h1
            class="text-[32px] leading-[40px] text-v2-text-text-strong"
            style={{ "font-family": "ui-serif, Georgia, Cambria, 'Times New Roman', serif", "font-weight": "500" }}
          >
            {language.t("artifacts.title")}
          </h1>
          <div class="mt-8 flex flex-wrap items-center gap-1">
            <For each={TABS}>
              {(kind) => (
                <button
                  type="button"
                  data-kind-filter={kind}
                  aria-pressed={filter.kind === kind}
                  class="h-8 rounded-[8px] px-3 text-[15px] text-v2-text-text-muted hover:text-v2-text-text-base aria-pressed:bg-v2-background-bg-deep aria-pressed:text-v2-text-text-strong"
                  onClick={() => setFilter("kind", kind)}
                >
                  {kind === "all" ? language.t("artifacts.kind.all") : language.t(kindLabelKey(kind))}
                </button>
              )}
            </For>
            <div class="ms-auto flex items-center gap-1">
              <Show when={filter.search}>
                <input
                  type="search"
                  autofocus
                  data-slot="artifacts-search"
                  value={filter.query}
                  placeholder={language.t("artifacts.search")}
                  aria-label={language.t("artifacts.search")}
                  class="h-8 w-56 rounded-[8px] bg-v2-background-bg-deep px-3 text-[13px] text-v2-text-text-base outline-none placeholder:text-v2-text-text-faint"
                  onInput={(event) => setFilter("query", event.currentTarget.value)}
                />
              </Show>
              <button
                type="button"
                data-action="artifacts-search"
                class={iconButton}
                aria-pressed={filter.search}
                aria-label={language.t("artifacts.search")}
                onClick={() => setFilter({ search: !filter.search, query: "" })}
              >
                <Icon name="magnifying-glass" />
              </button>
              <button
                type="button"
                data-action="artifacts-group"
                class="flex h-8 items-center gap-1.5 rounded-[8px] bg-v2-background-bg-deep px-3 text-[14px] text-v2-text-text-base"
                onClick={() => setFilter("group", filter.group === "none" ? "project" : "none")}
              >
                {language.t(filter.group === "none" ? "artifacts.groupBy" : "artifacts.groupByProject")}
                <Icon name="chevron-down" />
              </button>
              <button
                type="button"
                class={iconButton}
                aria-pressed={filter.list}
                aria-label={language.t("artifacts.listView")}
                onClick={() => setFilter("list", !filter.list)}
              >
                <Icon name="menu" />
              </button>
            </div>
          </div>

          <h2 class="mb-3 mt-8 text-[14px] text-v2-text-text-muted">{language.t("artifacts.makeNew")}</h2>
          <div class="flex flex-wrap gap-4">
            <For each={TEMPLATES}>
              {(template) => (
                <button
                  type="button"
                  data-template={template.kind}
                  class="flex w-40 flex-col gap-2 text-start"
                  onClick={() => newArtifact(template.kind)}
                >
                  <span
                    class={`flex h-28 items-center justify-center rounded-[14px] border border-v2-border-border-base bg-gradient-to-b ${template.tint} text-v2-text-text-strong transition-transform hover:-translate-y-0.5`}
                  >
                    <span class="flex size-12 items-center justify-center rounded-[12px] bg-white/10 text-[22px]">
                      <Icon name={template.icon} />
                    </span>
                  </span>
                  <span class="flex items-center gap-2 text-[15px] text-v2-text-text-strong [font-weight:530]">
                    {language.t(kindLabelKey(template.kind))}
                    <Show when={template.kind === "design"}>
                      <span class="rounded-[6px] bg-v2-background-bg-deep px-1.5 py-0.5 text-[11px] text-v2-text-text-muted [font-weight:500]">
                        {language.t("artifacts.badge.code")}
                      </span>
                    </Show>
                  </span>
                </button>
              )}
            </For>
          </div>

          <Show
            when={visible().length > 0}
            fallback={
              <div class="flex flex-col items-center gap-3 py-24 text-center text-13-regular text-v2-text-text-muted">
                <span>{language.t(controller.entries().length === 0 ? "artifacts.empty" : "artifacts.noMatch")}</span>
              </div>
            }
          >
            <For each={groups()}>
              {(group) => (
                <section class="mt-10 flex flex-col gap-4">
                  <Show when={group.name}>
                    <h3 class="text-[14px] text-v2-text-text-muted">{group.name}</h3>
                  </Show>
                  <div
                    class={
                      filter.list ? "flex flex-col gap-3" : "grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4"
                    }
                  >
                    <For each={group.entries}>
                      {(entry) => <ArtifactCard entry={entry} controller={controller} list={filter.list} />}
                    </For>
                  </div>
                </section>
              )}
            </For>
          </Show>
        </div>
      </ScrollView>
    </div>
  )
}

function ArtifactCard(props: { entry: Artifacts.Entry; controller: ArtifactsController; list: boolean }) {
  const language = useLanguage()

  const edited = () =>
    new Intl.DateTimeFormat(language.intl(), { month: "short", day: "numeric" }).format(props.entry.updated)

  const remove = (event: MouseEvent) => {
    event.stopPropagation()
    void props.controller
      .rpc()
      ?.remove({ id: props.entry.id })
      .then(() => props.controller.query.refetch())
      .catch(props.controller.fail)
  }

  return (
    <div
      data-component="artifact-card"
      data-kind={props.entry.kind}
      class="group relative overflow-hidden rounded-[14px] border border-v2-border-border-base bg-v2-background-bg-base transition-shadow hover:shadow-[var(--v2-elevation-raised)]"
      classList={{ "flex items-center": props.list }}
    >
      <button
        type="button"
        data-action="artifact-open"
        aria-label={language.t("artifacts.open", { title: props.entry.title })}
        class="flex w-full min-w-0 flex-1 text-start outline-none focus-visible:ring-2"
        classList={{ "flex-col": !props.list, "items-center gap-4": props.list }}
        onClick={() => void props.controller.open(props.entry)}
      >
        <div class="relative" classList={{ "w-full": !props.list, "w-48 shrink-0": props.list }}>
          <ArtifactPreview entry={props.entry} ctx={props.controller.ctx()} />
          <span class="absolute bottom-0 start-3 flex size-8 translate-y-1/2 items-center justify-center rounded-[8px] border border-v2-border-border-base bg-v2-background-bg-base text-v2-text-text-base">
            <Icon name={CHIP_ICON[props.entry.kind]} />
          </span>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5 px-4 pb-4" classList={{ "pt-6": !props.list, "pt-4": props.list }}>
          <span class="truncate text-[16px] text-v2-text-text-strong [font-weight:600]">{props.entry.title}</span>
          <span class="flex items-center gap-1.5 text-[13px] text-v2-text-text-muted">
            <Icon name="lock" />
            <span aria-hidden="true">·</span>
            <span class="truncate">
              {props.entry.missing ? language.t("artifacts.missing") : language.t("artifacts.edited", { date: edited() })}
              {" · "}
              {projectName(props.entry.directory)}
            </span>
          </span>
        </div>
      </button>
      <div class="absolute end-2 top-2 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Button
          size="small"
          variant="neutral"
          aria-label={language.t("artifacts.editWithChat")}
          title={language.t("artifacts.editWithChat")}
          onClick={() => void props.controller.editWithChat(props.entry)}
        >
          <Icon name="edit" />
        </Button>
        <Button
          size="small"
          variant="neutral"
          aria-label={language.t("artifacts.remove")}
          title={language.t("artifacts.remove")}
          onClick={remove}
        >
          <Icon name="outline-trash" />
        </Button>
      </div>
    </div>
  )
}
