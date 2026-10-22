// Fork: pure helpers for the artifact registry: kinds, file names, starter templates and design.json detection for an
// existing web project. Kept free of I/O so the server plugin and its tests share one implementation.

export const ARTIFACT_KINDS = ["html", "markdown", "slides", "svg", "csv", "pdf", "image", "design"] as const
export type RegistryKind = (typeof ARTIFACT_KINDS)[number]

const IMAGE = /\.(png|jpe?g|gif|webp|avif|bmp)$/i

/** The registry kind of a file, or undefined when it is not something the artifact viewer shows. */
export function registryKind(path: string): RegistryKind | undefined {
  const name = path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? ""
  if (name === "design.json" || name.endsWith(".design.json")) return "design"
  if (name.endsWith(".slides.md")) return "slides"
  if (/\.(md|markdown|mmd|mermaid)$/.test(name)) return "markdown"
  if (/\.html?$/.test(name)) return "html"
  if (name.endsWith(".svg")) return "svg"
  if (/\.(csv|tsv)$/.test(name)) return "csv"
  if (name.endsWith(".pdf")) return "pdf"
  if (IMAGE.test(name)) return "image"
}

/** Kinds whose contents are text, so versions keep snapshots. */
export const textKind = (kind: RegistryKind) => kind !== "pdf" && kind !== "image"

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "untitled"
  )
}

/** `slug`, `slug-2`, `slug-3`... until `taken` is false. */
export function uniqueSlug(slug: string, taken: (candidate: string) => boolean) {
  if (!taken(slug)) return slug
  for (let index = 2; ; index++) if (!taken(`${slug}-${index}`)) return `${slug}-${index}`
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

export function starterHtml(title: string) {
  const heading = escapeHtml(title)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${heading}</title>
<style>
  :root { --bg: #faf9f5; --fg: #1f1e1d; --muted: #6b6a68; --accent: #c96442; --card: #ffffff; --line: #e8e6dc; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #1f1e1d; --fg: #f5f4ee; --muted: #a8a69e; --card: #2b2a28; --line: #3a3835; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 16px/1.6 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 760px; margin: 0 auto; padding: 72px 24px; }
  h1 { font-size: 2.4rem; line-height: 1.15; margin: 0 0 12px; letter-spacing: -0.02em; }
  p { color: var(--muted); margin: 0 0 24px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
  button { font: inherit; background: var(--accent); color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; cursor: pointer; }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p>Ask the agent to build this out, or edit the file directly. Everything here is plain HTML, CSS and JavaScript.</p>
  <div class="card">
    <button id="go">Click me</button>
    <span id="out"></span>
  </div>
</main>
<script>
  let clicks = 0
  document.getElementById("go").addEventListener("click", () => {
    document.getElementById("out").textContent = " Clicked " + ++clicks + " time" + (clicks === 1 ? "" : "s")
  })
</script>
</body>
</html>
`
}

export function starterContent(kind: Exclude<RegistryKind, "pdf" | "image" | "design">, title: string) {
  if (kind === "html") return starterHtml(title)
  if (kind === "markdown")
    return `# ${title}\n\nStart writing here. Markdown, tables and Mermaid diagrams render in the viewer.\n\n\`\`\`mermaid\nflowchart LR\n  Idea --> Draft --> Done\n\`\`\`\n`
  if (kind === "slides")
    return `# ${title}\n\nA subtitle or the one-line pitch\n\n---\n\n## The problem\n\n- What hurts today\n- Who feels it\n\n---\n\n## The plan\n\n1. First step\n2. Second step\n3. Third step\n\n---\n\n## Thank you\n`
  if (kind === "svg")
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">\n  <title>${escapeHtml(title)}</title>\n  <rect width="400" height="240" rx="16" fill="#faf9f5"/>\n  <circle cx="200" cy="110" r="52" fill="#c96442"/>\n  <text x="200" y="206" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" fill="#1f1e1d">${escapeHtml(title)}</text>\n</svg>\n`
  return "name,value\nfirst,1\nsecond,2\nthird,3\n"
}

export function starterDesign(title: string) {
  return {
    manifest:
      JSON.stringify(
        {
          name: title,
          frames: [
            { name: "Desktop", file: "index.html" },
            { name: "Mobile", file: "index.html", width: 390, height: 844 },
          ],
        },
        undefined,
        2,
      ) + "\n",
    page: starterHtml(title),
  }
}

// ---- Detecting a design from an existing web project ----

const IGNORED = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.turbo|\.cache|vendor|tools)(\/|$)/
const MAX_FRAMES = 24

type Frame = { name: string; file?: string; url?: string; width?: number; height?: number; x?: number; y?: number }
export type DetectedDesign = { name: string; system?: string; frames: Frame[] }

/**
 * Builds a design manifest for an existing project from its relative file list. `read` returns a file's text.
 * Detection is best effort: static HTML pages become `file` frames, and a project with a dev server (a `url` was given,
 * or its pages/routes folders or router config show one) becomes `url` frames for each static route.
 */
export function detectDesign(input: {
  name: string
  files: readonly string[]
  read: (file: string) => string | undefined
  url?: string
}): DetectedDesign {
  const files = input.files.map((file) => file.replaceAll("\\", "/")).filter((file) => !IGNORED.test(file))
  // A router config lists the real routes; file-based routing is the fallback because page files rarely map 1:1.
  const configured = configRoutes(files, input.read)
  const routes = [...new Set(configured.length > 0 ? configured : fileRoutes(files))].sort(byRoute).slice(0, MAX_FRAMES - 1)
  const origin = input.url ? originOf(input.url) : routes.length > 0 ? guessOrigin(files, input.read) : undefined
  const system = findSystem(files, input.read)

  if (origin) {
    const paths = routes.length > 0 ? routes : ["/"]
    const frames: Frame[] = paths.flatMap((route, index) => {
      const url = origin + route
      return [
        { name: routeName(route), url },
        ...(index === 0 ? [{ name: `${routeName(route)} · phone`, url, width: 390, height: 844 }] : []),
      ]
    })
    return { name: input.name, ...(system ? { system } : {}), frames: place(frames) }
  }

  const pages = files
    .filter((file) => /\.html?$/i.test(file) && file.split("/").length <= 4)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, MAX_FRAMES)
  const frames: Frame[] = pages.flatMap((file, index) => [
    { name: pageName(file), file },
    ...(index === 0 ? [{ name: `${pageName(file)} · phone`, file, width: 390, height: 844 }] : []),
  ])
  return { name: input.name, ...(system ? { system } : {}), frames: place(frames) }
}

/** Lays frames out on a three-column grid so a big project doesn't become one endless row. */
const place = (frames: Frame[]): Frame[] =>
  frames.map((frame, index) => ({ ...frame, x: (index % 3) * 1560, y: Math.floor(index / 3) * 1100 }))

const byRoute = (a: string, b: string) =>
  a === "/" ? -1 : b === "/" ? 1 : a.split("/").length - b.split("/").length || a.localeCompare(b)

function originOf(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

/** Routes implied by file-based routing: src/pages, src/routes, pages, app/.../page.* */
function fileRoutes(files: readonly string[]) {
  return files.flatMap((file) => {
    const match =
      file.match(/^(?:src\/)?(?:pages|routes)\/(.+)\.(?:[jt]sx?|vue|svelte|astro|mdx?)$/) ??
      file.match(/^(?:src\/)?app\/(.+)\/page\.[jt]sx?$/)
    if (!match) return []
    const segments = match[1]!.split("/").filter((segment) => !/^(index|page|\+page)$/.test(segment))
    // Dynamic, private and API segments have no single URL.
    if (segments.some((segment) => /[[\]$:(_]/.test(segment) || segment === "api" || segment.startsWith("+"))) return []
    return ["/" + segments.join("/")]
  })
}

/** Routes written as `path: '/x'` or `path="/x"` in router configuration files. */
function configRoutes(files: readonly string[], read: (file: string) => string | undefined) {
  const candidates = files
    .filter((file) => file.startsWith("src/") && /(^|\/)(router|routes?|app|main|index)[^/]*\.[jt]sx?$/.test(file))
    .slice(0, 12)
  return candidates.flatMap((file) =>
    [...(read(file) ?? "").matchAll(/\bpath\s*[:=]\s*\{?\s*['"`](\/[^'"`:*?()\s]*)['"`]/g)].map((match) =>
      match[1]!.replace(/(.)\/$/, "$1"),
    ),
  )
}

function guessOrigin(files: readonly string[], read: (file: string) => string | undefined) {
  const serve = files.find((file) => /^(?:site\/)?(serve|server|dev)\.(?:m?js|ts)$/.test(file))
  const port =
    read("package.json")?.match(/--port[ =](\d{3,5})/)?.[1] ??
    files
      .filter((file) => /^vite\.config\.[mc]?[jt]s$/.test(file))
      .map((file) => read(file)?.match(/port\s*:\s*(\d{3,5})/)?.[1])
      .find(Boolean) ??
    (serve ? read(serve)?.match(/\|\|\s*(\d{4,5})/)?.[1] : undefined) ??
    (/"next"\s*:/.test(read("package.json") ?? "") ? "3000" : "5173")
  return `http://localhost:${port}`
}

function findSystem(files: readonly string[], read: (file: string) => string | undefined) {
  const css = files.filter((file) => file.endsWith(".css") && file.split("/").length <= 4)
  const rank = (file: string) =>
    /token|theme|variables|vars/i.test(file) ? 0 : /global|index|base|main/i.test(file) ? 1 : 2
  return css
    .filter((file) => /:root[^{]*\{[^}]*--[\w-]+\s*:/s.test(read(file) ?? ""))
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0]
}

const titleCase = (text: string) => text.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase())
const routeName = (route: string) => (route === "/" ? "Home" : titleCase(route.slice(1).replaceAll("/", " · ")))
const pageName = (file: string) => {
  const name = file.replace(/\.html?$/i, "").replace(/\/index$/, "") || "index"
  return name === "index" ? "Home" : titleCase(name.replaceAll("/", " · "))
}
