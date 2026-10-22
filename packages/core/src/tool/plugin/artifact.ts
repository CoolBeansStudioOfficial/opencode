/**
 * Fork: shows a file the agent made to the user, the way Claude publishes an artifact. The app opens the file in the
 * session's side panel, where HTML, Markdown, SVG, Mermaid, CSV, PDF, images and `.slides.md` decks render live and
 * reload as the agent edits them. Works in every client, unlike the desktop-only browser `preview`.
 */
export * as ArtifactTool from "./artifact.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { ToolFailure } from "@opencode/ai"
import { Effect, Schema } from "effect"
import { Environment } from "../../environment/index.js"
import { FileAccess } from "../../file-access.js"

export const name = "artifact"

export const description = `Show a file you created to the user in a side panel next to the chat. Use it for pages, reports, diagrams, slide decks and other results the user should look at, not for source files they only need to know about.

Write the file first with the write tool, then call this with its path. The panel re-renders when you edit the file, so call it once per artifact.

Renders:
- .md: documents. Mermaid code blocks render as diagrams.
- .slides.md: a slide deck. Separate slides with a line containing only ---. Each slide is Markdown; the first heading is its title.
- .svg, .mmd (Mermaid), .csv/.tsv (tables), .pdf, images.
- .html: a single self-contained page (inline CSS and JS, no external scripts; it runs in a sandbox with no network). The user can switch it to the design canvas.
- design.json (or *.design.json): a design canvas, below.

Designs are real web code, never mockups. A design canvas shows frames of the project's actual pages, so there is nothing to convert afterwards and the design cannot drift from the site:
- Build or change the design in the project's real source, in its own framework and styles (components, routes, CSS). Don't create separate mockup copies.
- To show it, write a design.json next to the code and call this tool on it:
  {"name": "Checkout", "system": "src/styles/tokens.css", "frames": [
    {"name": "Desktop", "url": "http://localhost:5173/checkout"},
    {"name": "Mobile", "url": "http://localhost:5173/checkout", "width": 390, "height": 844},
    {"name": "Empty state", "file": "public/empty.html"}]}
  "url" frames show the running app (start its dev server first; loopback URLs are proxied so they work from the user's phone too). "file" frames show a static HTML page from the project, with relative assets. Paths are relative to the design.json. Frames default to 1440×900; optional x/y place them on the canvas.
- "system" points at the project's real stylesheet whose CSS custom properties are the design system; reuse those tokens instead of hard-coding values.
- To open existing web code as a design, write a design.json whose frames point at the existing pages or app routes.
- The canvas reloads every frame when files change. The user can click any element to comment on it; those comments name the element's selector and HTML so you can find it in the source.`

export const Input = Schema.Struct({
  path: Schema.String.annotate({ description: "Path of the file to show, relative to the project or absolute" }),
  title: Schema.optional(Schema.String).annotate({ description: "Short title for the artifact" }),
})

export const Output = Schema.Struct({
  path: Schema.String,
  resource: Schema.String,
  title: Schema.String,
})
export type Output = typeof Output.Type

export const Plugin = {
  id: "opencode.tool.artifact",
  effect: Effect.fn("ArtifactTool.Plugin")(function* (ctx: Context) {
    const access = yield* FileAccess.Service
    const environment = yield* Environment.Service

    yield* ctx.tool
      .transform((editor) =>
        editor.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (input) =>
            Effect.gen(function* () {
              const target = yield* access.resolve({ path: input.path, kind: "file" })
              const info = yield* environment.files.stat(target.absolute).pipe(
                Effect.mapError(
                  () => new ToolFailure({ message: `No file at ${target.resource}. Write it before showing it.` }),
                ),
              )
              if (info.type !== "file") return yield* new ToolFailure({ message: `${target.resource} is not a file` })
              const title = input.title?.trim() || target.resource.split(/[\\/]/).pop() || target.resource
              return {
                output: { path: target.absolute, resource: target.resource, title },
                content: `Showing ${target.resource} to the user in the side panel.`,
                metadata: { path: target.absolute, title },
              }
            }).pipe(
              Effect.mapError((error) =>
                error instanceof ToolFailure ? error : new ToolFailure({ message: "Unable to show the file", error }),
              ),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
