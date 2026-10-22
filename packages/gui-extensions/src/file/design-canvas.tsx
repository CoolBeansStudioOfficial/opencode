import { Design as DesignRpc } from "@opencode/schema/design"
import { Button } from "@opencode/ui/button"
import { debounce } from "@solid-primitives/scheduled"
import { makeEventListener } from "@solid-primitives/event-listener"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { Schema } from "effect"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { createKeyed, createLatest, useExtension, type MountedSession } from "../sdk"
import { resolveArtifactPath } from "./artifact"
import { designBounds, designTokens, localPort, type Design, type DesignFrame } from "./design"

// Fork: Claude-Design-style canvas. Every frame is real web code: a page from this project or the running app, served
// through the server's ticketed `/design/...` route with an inspector injected. Comments on elements go to the
// composer, so the agent edits that same code and the frame reloads; there is no mockup to convert or drift.

const Selected = Schema.Struct({
  type: Schema.Literal("oc-design.select"),
  element: Schema.Struct({
    selector: Schema.String,
    tag: Schema.String,
    text: Schema.String,
    html: Schema.String,
    url: Schema.String,
    rect: Schema.Struct({ x: Schema.Number, y: Schema.Number, width: Schema.Number, height: Schema.Number }),
    styles: Schema.Record(Schema.String, Schema.String),
  }),
})

const isSelected = Schema.is(Selected)

type Element = (typeof Selected.Type)["element"]

const ZOOM = { min: 0.05, max: 2 }

export function DesignCanvas(props: { session: MountedSession; path: string; design: Design }) {
  const ctx = useExtension()
  // `moved` turns off auto-fit once the user pans or zooms; until then the canvas refits whenever it resizes.
  const [view, setView] = createStore({ zoom: 0.25, x: 40, y: 40, moved: false })
  const [commenting, setCommenting] = createSignal(false)
  const [showSystem, setShowSystem] = createSignal(false)
  const [version, setVersion] = createSignal(0)
  const [selection, setSelection] = createStore<{ frame?: DesignFrame; element?: Element; draft: string }>({ draft: "" })
  const frames = new Map<string, HTMLIFrameElement>()
  let viewport: HTMLDivElement | undefined

  const directory = () => props.session.directory
  const manifestDir = () => (props.path.includes("/") || props.path.includes("\\") ? props.path.replace(/[\\/][^\\/]*$/, "") : "")

  const files = createLatest(
    () => ({ server: props.session.server, directory: directory() }),
    (current) => current.server.client.rpc(DesignRpc.Definition).files({ directory: current.directory }),
  )

  const ports = createMemo(() =>
    [...new Set(props.design.frames.flatMap((frame) => (frame.source.kind === "url" ? [localPort(frame.source.url)?.port ?? 0] : [])))].filter(
      Boolean,
    ),
  )

  const live = createLatest(
    () => ({ server: props.session.server, ports: ports().join(",") }),
    async (current) =>
      Object.fromEntries(
        await Promise.all(
          ports().map(async (port) => [port, await current.server.client.rpc(DesignRpc.Definition).live({ port })] as const),
        ),
      ),
  )

  // The design system is the project's own stylesheet; its custom properties are the tokens every frame shares.
  const systemUrl = () => {
    const relative = props.design.system ? resolveArtifactPath(manifestDir(), props.design.system) : undefined

    return files.latest && relative
      ? `${props.session.server.url.replace(/\/$/, "")}${files.latest}/${relative.replace(/^\//, "")}`
      : undefined
  }

  const system = createLatest(systemUrl, (url, signal) =>
    fetch(url, { signal, cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
  )

  const tokens = createMemo(() => designTokens(system.latest ?? ""))
  const isColor = (value: string) => typeof CSS !== "undefined" && CSS.supports("color", value)

  const src = (frame: DesignFrame) => {
    const origin = props.session.server.url.replace(/\/$/, "")

    if (frame.source.kind === "url") {
      const local = localPort(frame.source.url)
      const prefix = local ? live.latest?.[local.port] : undefined

      if (!local) return frame.source.url

      return prefix ? `${origin}${prefix}${local.path.startsWith("/") ? local.path : `/${local.path}`}` : undefined
    }

    const base = files.latest
    const relative = resolveArtifactPath(manifestDir(), frame.source.path)

    return base && relative ? `${origin}${base}/${relative.replace(/^\//, "")}` : undefined
  }

  // Real code changes on disk reload every frame (live frames too, so no dev-server socket is needed). The server
  // counts changes in the project folder; the canvas polls that counter.
  const reload = debounce(() => setVersion((value) => value + 1), 150)
  createKeyed(
    () => (files.latest ? `${props.session.server.url.replace(/\/$/, "")}${files.latest.replace(/\/file$/, "")}/version` : undefined),
    (url) => {
      let last: string | undefined

      const timer = setInterval(() => {
        void fetch(url, { cache: "no-store" })
          .then((response) => (response.ok ? response.text() : undefined))
          .then((value) => {
            if (value === undefined) return

            if (last !== undefined && value !== last) reload()
            last = value
          })
          .catch(() => undefined)
      }, 1000)

      onCleanup(() => clearInterval(timer))
    },
  )

  makeEventListener(window, "message", (event: MessageEvent) => {
    if (!isSelected(event.data)) return
    const frame = props.design.frames.find((item) => frames.get(item.id)?.contentWindow === event.source)

    if (!frame) return
    setSelection({ frame, element: event.data.element, draft: "" })
  })

  const broadcast = (enabled: boolean) => {
    setCommenting(enabled)

    for (const frame of frames.values()) frame.contentWindow?.postMessage({ type: "oc-design.comment", enabled }, "*")
  }

  const fit = () => {
    if (!viewport) return
    const bounds = designBounds(props.design.frames)
    const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, Math.min((viewport.clientWidth - 80) / bounds.width, (viewport.clientHeight - 120) / (bounds.height + 40))))
    setView({ zoom, x: 40 - bounds.x * zoom, y: 60 - bounds.y * zoom })
  }

  const zoomAt = (factor: number, cx: number, cy: number) => {
    const zoom = Math.min(ZOOM.max, Math.max(ZOOM.min, view.zoom * factor))
    const scale = zoom / view.zoom
    setView({ zoom, x: cx - (cx - view.x) * scale, y: cy - (cy - view.y) * scale, moved: true })
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = viewport?.getBoundingClientRect()

    if (event.ctrlKey || event.metaKey) zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0))
    else setView({ x: view.x - event.deltaX, y: view.y - event.deltaY, moved: true })
  }

  let drag: { x: number; y: number } | undefined

  const send = () => {
    const element = selection.element
    const frame = selection.frame
    const screen = ctx.screen.current()

    if (!element || !frame || !screen || !selection.draft.trim()) return
    const source = frame.source.kind === "file" ? resolveArtifactPath(manifestDir(), frame.source.path) : frame.source.url
    screen.composer.attach({
      type: "note",
      origin: ctx.id,
      commentID: crypto.randomUUID(),
      label: `${frame.name}: ${element.selector.split(" > ").pop() ?? element.tag}`,
      icon: "select-element",
      subject: [
        `the element ${JSON.stringify(element.selector)} in the design frame ${JSON.stringify(frame.name)} (${source}; ${element.url})`,
        element.text ? `Its text: ${JSON.stringify(element.text)}` : "",
        `Its HTML: ${element.html}`,
        `Computed styles: ${JSON.stringify(element.styles)}`,
        "The frame renders the project's real code; change that source.",
      ]
        .filter(Boolean)
        .join("\n"),
      comment: selection.draft.trim(),
    })
    setSelection({ frame: undefined, element: undefined, draft: "" })
  }

  return (
    <div data-component="design-canvas" class="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div class="flex shrink-0 items-center gap-2 border-b border-v2-border-border-base px-3 py-1.5 text-[12px] text-v2-text-text-muted">
        <span class="min-w-0 flex-1 truncate text-v2-text-text-base">{props.design.name ?? ctx.t("design.title")}</span>
        <Show when={props.design.system}>
          <Button size="small" variant={showSystem() ? "neutral" : "ghost"} onClick={() => setShowSystem(!showSystem())}>
            {ctx.t("design.system")}
          </Button>
        </Show>
        <Button size="small" variant={commenting() ? "neutral" : "ghost"} onClick={() => broadcast(!commenting())}>
          {ctx.t(commenting() ? "design.commenting" : "design.comment")}
        </Button>
        <Button size="small" variant="ghost" onClick={() => zoomAt(1 / 1.25, (viewport?.clientWidth ?? 0) / 2, (viewport?.clientHeight ?? 0) / 2)}>
          −
        </Button>
        <span class="w-10 text-center tabular-nums">{Math.round(view.zoom * 100)}%</span>
        <Button size="small" variant="ghost" onClick={() => zoomAt(1.25, (viewport?.clientWidth ?? 0) / 2, (viewport?.clientHeight ?? 0) / 2)}>
          +
        </Button>
        <Button
          size="small"
          variant="ghost"
          onClick={() => {
            setView("moved", false)
            fit()
          }}
        >
          {ctx.t("design.fit")}
        </Button>
      </div>
      <div
        ref={(element) => {
          viewport = element
          createResizeObserver(element, () => !view.moved && fit())
        }}
        class="relative min-h-0 flex-1 overflow-hidden bg-v2-background-bg-deep"
        classList={{ "cursor-grab": !commenting() }}
        onWheel={onWheel}
        onPointerDown={(event) => {
          if (event.target !== viewport) return
          drag = { x: event.clientX - view.x, y: event.clientY - view.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => drag && setView({ x: event.clientX - drag.x, y: event.clientY - drag.y, moved: true })}
        onPointerUp={() => (drag = undefined)}
      >
        <div
          class="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <For each={props.design.frames}>
            {(frame) => (
              <div class="absolute" style={{ left: `${frame.x}px`, top: `${frame.y}px`, width: `${frame.width}px` }}>
                <div class="mb-3 flex items-center gap-3 text-v2-text-text-muted" style={{ "font-size": `${Math.max(12, 13 / view.zoom)}px` }}>
                  <span class="truncate text-v2-text-text-base">{frame.name}</span>
                  <span>
                    {frame.width} × {frame.height}
                  </span>
                  <Show when={src(frame)}>
                    {(url) => (
                      <a class="hover:underline" href={url()} target="_blank" rel="noreferrer">
                        {ctx.t("design.open")}
                      </a>
                    )}
                  </Show>
                </div>
                <div
                  class="overflow-hidden rounded-[12px] bg-white shadow-[var(--v2-elevation-raised)]"
                  style={{ width: `${frame.width}px`, height: `${frame.height}px` }}
                >
                  <Show when={`${version()}|${src(frame) ?? ""}`} keyed>
                    {(_reload) => (
                      <Show when={src(frame)} fallback={<div class="p-6 text-v2-text-text-faint">{ctx.t("design.loading")}</div>}>
                        {(url) => (
                          <iframe
                            ref={(element) => frames.set(frame.id, element)}
                            title={frame.name}
                            src={url()}
                            class="block size-full border-0"
                            onLoad={(event) =>
                              event.currentTarget.contentWindow?.postMessage({ type: "oc-design.comment", enabled: commenting() }, "*")
                            }
                          />
                        )}
                      </Show>
                    )}
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
      <Show when={showSystem()}>
        <div
          data-slot="design-system"
          class="absolute right-3 top-12 flex max-h-[calc(100%-64px)] w-64 flex-col gap-1 overflow-auto rounded-[12px] border border-v2-border-border-base bg-v2-background-bg-base p-3 text-[12px] shadow-[var(--v2-elevation-raised)]"
        >
          <div class="mb-1 truncate text-v2-text-text-muted">{props.design.system}</div>
          <Show when={tokens().length > 0} fallback={<span class="text-v2-text-text-faint">{ctx.t("design.noTokens")}</span>}>
            <For each={tokens()}>
              {(token) => (
                <div class="flex items-center gap-2">
                  <span
                    class="size-4 shrink-0 rounded-[4px] border border-v2-border-border-base"
                    style={{ background: isColor(token.value) ? token.value : "transparent" }}
                  />
                  <code class="min-w-0 flex-1 truncate text-v2-text-text-base">{token.name}</code>
                  <span class="max-w-24 truncate text-v2-text-text-muted">{token.value}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
      <Show when={selection.element}>
        {(element) => (
          <div class="absolute bottom-3 left-1/2 flex w-[min(520px,calc(100%-24px))] -translate-x-1/2 flex-col gap-2 rounded-[12px] border border-v2-border-border-base bg-v2-background-bg-base p-3 shadow-[var(--v2-elevation-raised)]">
            <div class="truncate text-[12px] text-v2-text-text-muted">
              {selection.frame?.name} · <code>{element().selector}</code>
            </div>
            <textarea
              autofocus
              rows={3}
              value={selection.draft}
              placeholder={ctx.t("design.commentPlaceholder")}
              class="w-full resize-none rounded-[8px] border border-v2-border-border-base bg-transparent p-2 text-[13px] text-v2-text-text-base outline-none"
              onInput={(event) => setSelection("draft", event.currentTarget.value)}
              onKeyDown={(event) => {
                event.stopPropagation()

                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) send()

                if (event.key === "Escape") setSelection({ frame: undefined, element: undefined, draft: "" })
              }}
            />
            <div class="flex justify-end gap-2">
              <Button size="small" variant="ghost" onClick={() => setSelection({ frame: undefined, element: undefined, draft: "" })}>
                {ctx.t("design.cancel")}
              </Button>
              <Button size="small" disabled={!selection.draft.trim()} onClick={send}>
                {ctx.t("design.addToChat")}
              </Button>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
