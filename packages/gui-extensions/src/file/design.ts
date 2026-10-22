import { Result, Schema } from "effect"

// Fork: Claude-Design-style canvases. A `design.json` manifest lists frames; each frame is an HTML file in the
// project (a mockup) or a URL of a local dev server (the live site, proxied so edits to the real code show at once).

/** Whether a file is a design manifest the canvas renders. */
export function isDesign(path: string) {
  return /(^|[\\/])design\.json$/i.test(path) || path.toLowerCase().endsWith(".design.json")
}

const Frame = Schema.Struct({
  id: Schema.optional(Schema.String),
  name: Schema.String,
  file: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  x: Schema.optional(Schema.Number),
  y: Schema.optional(Schema.Number),
})

const Manifest = Schema.Struct({
  name: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  frames: Schema.Array(Frame),
})

const decode = Schema.decodeUnknownResult(Schema.fromJsonString(Manifest))

export type DesignFrame = {
  id: string
  name: string
  source: { kind: "file"; path: string } | { kind: "url"; url: string }
  width: number
  height: number
  x: number
  y: number
}

export type Design = { name?: string; system?: string; frames: DesignFrame[] }

const GAP = 120

const DEFAULT = { width: 1440, height: 900 }

/** Parses a manifest; frames without a file or URL are dropped, and frames without a position flow left to right. */
export function parseDesign(text: string): Design | { error: string } {
  const result = decode(text)

  if (Result.isFailure(result)) return { error: String(result.failure) }
  let cursor = 0

  const frames = result.success.frames.flatMap((frame, index): DesignFrame[] => {
    const source = frame.url
      ? { kind: "url" as const, url: frame.url }
      : frame.file
        ? { kind: "file" as const, path: frame.file }
        : undefined

    if (!source) return []
    const width = frame.width ?? DEFAULT.width
    const height = frame.height ?? DEFAULT.height
    const x = frame.x ?? cursor
    cursor = Math.max(cursor, x + width + GAP)

    return [{ id: frame.id ?? `${index}`, name: frame.name, source, width, height, x, y: frame.y ?? 0 }]
  })

  return { name: result.success.name, system: result.success.system, frames }
}

/** The canvas bounds holding every frame, for fit-to-view. */
export function designBounds(frames: readonly DesignFrame[]) {
  if (frames.length === 0) return { x: 0, y: 0, width: 1, height: 1 }
  const left = Math.min(...frames.map((frame) => frame.x))
  const top = Math.min(...frames.map((frame) => frame.y))
  const right = Math.max(...frames.map((frame) => frame.x + frame.width))
  const bottom = Math.max(...frames.map((frame) => frame.y + frame.height))

  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Only loopback dev servers are proxied; anything else stays a direct URL. */
export function localPort(url: string) {
  try {
    const parsed = new URL(url)

    if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)) return undefined

    return { port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80)), path: `${parsed.pathname}${parsed.search}` }
  } catch {
    return undefined
  }
}

/** CSS custom properties declared in a stylesheet, in order, last declaration winning: the design system's tokens. */
export function designTokens(css: string) {
  const tokens = new Map<string, string>()

  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g))
    tokens.set(match[1], match[2].trim())

  return [...tokens].map(([name, value]) => ({ name, value }))
}
