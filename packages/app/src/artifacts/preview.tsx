import type { Artifacts } from "@opencode/schema/artifacts"
import { Icon } from "@opencode/ui/icon"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Schema } from "effect"
import { createEffect, createSignal, on, onCleanup, onMount, Show, untrack } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import type { ServerCtx } from "@/runtime/server/runtime"

// Fork: the live thumbnail on an artifact card. The file is read once the card scrolls into view and drawn in a
// sandboxed, scaled iframe (scripts may run, but with no storage, network identity or navigation), so a card shows
// what the artifact really looks like.
const WIDTH = 1280
const HEIGHT = 800

const Manifest = Schema.Struct({
  frames: Schema.Array(Schema.Struct({ file: Schema.optional(Schema.String), url: Schema.optional(Schema.String) })),
})
const decodeManifest = Schema.decodeUnknownOption(Schema.fromJsonString(Manifest))

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

const PAGE = (body: string) =>
  `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}body{font:28px/1.5 system-ui,sans-serif;color:#1f1e1d;background:#faf9f5;padding:64px 80px}h1{font-size:64px;margin:0 0 24px}h2{font-size:44px;margin:0 0 16px}p,li{margin:0 0 12px}table{border-collapse:collapse;font-size:26px}td,th{border:1px solid #d9d6cc;padding:8px 16px;text-align:left}</style>${body}`

function miniMarkdown(text: string) {
  return PAGE(
    text
      .split("\n")
      .filter((line) => !line.startsWith("```"))
      .slice(0, 40)
      .map((line) =>
        line.startsWith("# ")
          ? `<h1>${escape(line.slice(2))}</h1>`
          : line.startsWith("## ")
            ? `<h2>${escape(line.slice(3))}</h2>`
            : /^\s*[-*] /.test(line)
              ? `<li>${escape(line.replace(/^\s*[-*] /, ""))}</li>`
              : line.trim()
                ? `<p>${escape(line.replace(/^#+ /, ""))}</p>`
                : "",
      )
      .join(""),
  )
}

function table(text: string) {
  const rows = text.split("\n").filter(Boolean).slice(0, 12).map((row) => row.split(/[,\t]/))
  return PAGE(
    `<table>${rows.map((row, index) => `<tr>${row.map((cell) => `<${index ? "td" : "th"}>${escape(cell.replace(/^"|"$/g, ""))}</${index ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`,
  )
}

const dirname = (path: string) => path.replace(/[\\/][^\\/]*$/, "")
const basename = (path: string) => path.split(/[\\/]/).pop() ?? path

export function ArtifactPreview(props: { entry: Artifacts.Entry; ctx: ServerCtx | undefined }) {
  const language = useLanguage()
  const [visible, setVisible] = createSignal(false)
  const [doc, setDoc] = createSignal<{ html?: string; image?: string }>()
  const [scale, setScale] = createSignal(0.2)
  let root!: HTMLDivElement

  createEffect(() => {
    const observer = new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && setVisible(true))
    observer.observe(root)
    onCleanup(() => observer.disconnect())
  })

  onMount(() => {
    setScale(root.clientWidth / WIDTH)
    createResizeObserver(root, (rect) => setScale(rect.width / WIDTH))
  })

  const read = (path: string) =>
    props.ctx!.sdk.api.file.read({ path: basename(path), location: { directory: dirname(path) } })

  // Re-read when the artifact changes (its update time moves) so a card follows the agent's edits. Refetches that
  // return the same entry replace the object but not these values, so they read nothing.
  createEffect(
    on(
      () => [visible(), props.entry.path, props.entry.updated, !!props.ctx] as const,
      ([isVisible, , , hasServer]) => {
        const entry = untrack(() => props.entry)
        if (!isVisible || !hasServer || entry.missing) return
        let current = true
        onCleanup(() => (current = false))

        void load(entry)
          .then((value) => current && setDoc(value))
          .catch(() => undefined)
      },
    ),
  )

  async function load(entry: Artifacts.Entry): Promise<{ html?: string; image?: string }> {
    if (entry.kind === "pdf") return {}
    const bytes = await read(entry.path)
    if (entry.kind === "image") return { image: URL.createObjectURL(new Blob([new Uint8Array(bytes)])) }
    const text = new TextDecoder().decode(bytes)
    if (entry.kind === "html") return { html: text }
    if (entry.kind === "svg") return { html: PAGE(text) }
    if (entry.kind === "markdown") return { html: miniMarkdown(text) }
    if (entry.kind === "slides") return { html: miniMarkdown(text.split(/\n---+\s*\n/)[0] ?? text) }
    if (entry.kind === "csv") return { html: table(text) }
    const manifest = decodeManifest(text)
    const file = manifest._tag === "Some" ? manifest.value.frames.find((frame) => frame.file)?.file : undefined
    if (!file) return {}
    const page = await read(`${dirname(entry.path)}/${file}`)
    return { html: new TextDecoder().decode(page) }
  }

  onCleanup(() => {
    const image = doc()?.image
    if (image) URL.revokeObjectURL(image)
  })

  return (
    <div ref={root} class="relative aspect-[8/5] w-full overflow-hidden" style={{ background: "#fff" }}>
      <Show
        when={doc()?.html ?? doc()?.image}
        fallback={
          <div class="absolute inset-0 flex items-center justify-center text-v2-text-text-faint">
            <Icon name={props.entry.kind === "design" ? "select-element" : "code-lines"} />
            <Show when={props.entry.kind === "design"}>
              <span class="ms-2 text-12-regular">{language.t("artifacts.liveDesign")}</span>
            </Show>
          </div>
        }
      >
        <Show
          when={doc()?.html}
          fallback={<img src={doc()?.image} alt="" class="absolute inset-0 size-full object-cover object-top" />}
        >
          {(html) => (
            <iframe
              title={props.entry.title}
              tabIndex={-1}
              aria-hidden="true"
              loading="lazy"
              sandbox="allow-scripts"
              srcdoc={html()}
              class="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
              style={{ width: `${WIDTH}px`, height: `${HEIGHT}px`, transform: `scale(${scale()})` }}
            />
          )}
        </Show>
      </Show>
    </div>
  )
}
