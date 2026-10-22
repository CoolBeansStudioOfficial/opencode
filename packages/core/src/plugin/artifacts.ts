export * as ArtifactsRegistry from "./artifacts.js"

import type { Context } from "@opencode/plugin/effect/plugin"
import { Artifacts } from "@opencode/schema/artifacts"
import {
  detectDesign,
  registryKind,
  slugify,
  starterContent,
  starterDesign,
  textKind,
  uniqueSlug,
  type RegistryKind,
} from "@opencode/util/artifact-registry"
import { Effect, Schema } from "effect"
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

// Fork: the artifact registry. Entries and text snapshots live in the tool plugin's storage. Every operation that
// can see the file refreshes the entry first, so edits the agent makes after showing an artifact become versions.
const ENTRY = "entry:"
const VERSION = "ver:"
const MAX_VERSIONS = 50
const MAX_SNAPSHOT_BYTES = 1_000_000
const IGNORED = new Set(["node_modules", ".git", "dist", "build", "out", ".next", ".turbo", ".cache", "coverage"])

// Stored entries carry the bookkeeping needed to refresh cheaply.
const Stored = Schema.Struct({
  ...Artifacts.Entry.fields,
  mtime: Schema.Number,
  hash: Schema.String,
})
type Stored = typeof Stored.Type
const decodeStored = Schema.decodeUnknownOption(Stored)
const decodeVersion = Schema.decodeUnknownOption(
  Schema.Struct({ n: Schema.Number, time: Schema.Number, content: Schema.String }),
)

export const entryID = (file: string) => Bun.hash(path.normalize(file).toLowerCase()).toString(36)
const versionKey = (id: string, n: number) => `${VERSION}${id}:${String(n).padStart(6, "0")}`

const publicEntry = (stored: Stored): Artifacts.Entry => ({
  id: stored.id,
  path: stored.path,
  title: stored.title,
  kind: stored.kind,
  directory: stored.directory,
  ...(stored.sessionID ? { sessionID: stored.sessionID } : {}),
  created: stored.created,
  updated: stored.updated,
  versions: stored.versions,
  missing: stored.missing,
})

export function make(ctx: Context) {
  const load = (id: string) =>
    ctx.storage.get(ENTRY + id).pipe(
      Effect.map((value) => {
        const stored = decodeStored(value)
        return stored._tag === "Some" ? stored.value : undefined
      }),
    )

  const save = (stored: Stored) => ctx.storage.set(ENTRY + stored.id, { ...stored }).pipe(Effect.as(stored))

  /** Re-reads the file and records a new version when its text changed. */
  const refresh = (stored: Stored) =>
    Effect.gen(function* () {
      const info = statSync(stored.path, { throwIfNoEntry: false })
      if (!info?.isFile()) return stored.missing ? stored : yield* save({ ...stored, missing: true })
      if (info.mtimeMs === stored.mtime && !stored.missing) return stored

      if (!textKind(stored.kind) || info.size > MAX_SNAPSHOT_BYTES)
        return yield* save({
          ...stored,
          missing: false,
          mtime: info.mtimeMs,
          versions: Math.max(1, stored.versions),
          updated: Math.max(stored.updated, info.mtimeMs),
        })

      const text = yield* Effect.promise(() => readFile(stored.path, "utf8"))
      const hash = Bun.hash(text).toString(36)
      if (hash === stored.hash) return yield* save({ ...stored, missing: false, mtime: info.mtimeMs })

      const n = stored.versions + 1
      yield* ctx.storage.set(versionKey(stored.id, n), { n, time: Date.now(), content: text })
      if (n > MAX_VERSIONS) yield* ctx.storage.remove(versionKey(stored.id, n - MAX_VERSIONS))
      return yield* save({ ...stored, missing: false, mtime: info.mtimeMs, hash, versions: n, updated: Date.now() })
    })

  const record = (input: {
    path: string
    directory: string
    title?: string
    sessionID?: string
  }): Effect.Effect<Artifacts.Entry | null> =>
    Effect.gen(function* () {
      const file = path.resolve(input.path)
      const kind = registryKind(file)
      if (!kind || !statSync(file, { throwIfNoEntry: false })?.isFile()) return null
      const id = entryID(file)
      const existing = yield* load(id)
      const title = input.title?.trim()
      const now = Date.now()
      const base: Stored = existing ?? {
        id,
        path: file,
        title: title || path.basename(file),
        kind,
        directory: path.resolve(input.directory),
        created: now,
        updated: now,
        versions: 0,
        missing: false,
        mtime: 0,
        hash: "",
        ...(input.sessionID ? { sessionID: input.sessionID } : {}),
      }
      const next = {
        ...base,
        ...(title ? { title } : {}),
        ...(input.sessionID && !base.sessionID ? { sessionID: input.sessionID } : {}),
      }
      const changed = next.title !== base.title || next.sessionID !== base.sessionID
      return publicEntry(yield* refresh(changed && existing ? yield* save(next) : next))
    }).pipe(Effect.orDie)

  const list = Effect.gen(function* () {
    const result = yield* ctx.storage.scan({ prefix: ENTRY, limit: 500 })
    const entries = yield* Effect.forEach(
      result.entries.flatMap((entry) => {
        const stored = decodeStored(entry.value)
        return stored._tag === "Some" ? [stored.value] : []
      }),
      (stored) => refresh(stored),
      { concurrency: 8 },
    )
    return entries.map(publicEntry).sort((a, b) => b.updated - a.updated)
  })

  const history = (id: string) =>
    Effect.gen(function* () {
      const stored = yield* load(id)
      if (!stored) return []
      const refreshed = yield* refresh(stored)
      const result = yield* ctx.storage.scan({ prefix: `${VERSION}${id}:`, limit: MAX_VERSIONS + 5 })
      const versions = result.entries.flatMap((entry) => {
        const version = decodeVersion(entry.value)
        return version._tag === "Some"
          ? [{ n: version.value.n, time: version.value.time, bytes: Buffer.byteLength(version.value.content) }]
          : []
      })
      // Binary artifacts have no snapshots: report just the current file.
      return versions.length > 0 || textKind(refreshed.kind)
        ? versions.sort((a, b) => b.n - a.n)
        : [{ n: 1, time: refreshed.updated, bytes: statSync(refreshed.path, { throwIfNoEntry: false })?.size ?? 0 }]
    })

  const restore = (id: string, n: number) =>
    Effect.gen(function* () {
      const stored = yield* load(id)
      if (!stored) return null
      const version = decodeVersion(yield* ctx.storage.get(versionKey(id, n)))
      if (version._tag === "None") return null
      yield* Effect.promise(() => writeFile(stored.path, version.value.content))
      return publicEntry(yield* refresh(stored))
    }).pipe(Effect.orDie)

  const create = (input: Schema.Schema.Type<typeof createInput>) =>
    Effect.gen(function* () {
      const directory = path.resolve(input.directory)
      const folder = path.resolve(directory, input.folder?.trim() || "artifacts")
      const relative = path.relative(directory, folder)
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return yield* Effect.die(new Error("The folder must be inside the project"))

      const title = input.name.trim() || "Untitled"
      const slug = slugify(title)
      yield* Effect.promise(() => mkdir(folder, { recursive: true }))
      const file = yield* Effect.promise(() => place(folder, input.kind, title, slug))
      return (yield* record({ path: file, directory, title, sessionID: input.sessionID }))!
    })

  const detect = (input: { directory: string; url?: string }) =>
    Effect.gen(function* () {
      const directory = path.resolve(input.directory)
      if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory())
        return yield* Effect.die(new Error("That folder does not exist"))
      const design = detectDesign({
        name: path.basename(directory),
        files: walk(directory),
        read: (file) => {
          try {
            return readFileSync(path.join(directory, file), "utf8")
          } catch {
            return undefined
          }
        },
        url: input.url?.trim() || undefined,
      })
      // Never overwrite a manifest the project already has.
      const file = uniqueSlug("design", (slug) => existsSync(path.join(directory, manifestName(slug)))) 
      const manifest = manifestName(file)
      yield* Effect.promise(() => writeFile(path.join(directory, manifest), JSON.stringify(design, undefined, 2) + "\n"))
      const entry = yield* record({ path: path.join(directory, manifest), directory, title: `${design.name} design` })
      return { entry: entry!, frames: design.frames.length, file: manifest }
    })

  const saveShot = (input: { directory: string; id: string; data: string }) =>
    Effect.gen(function* () {
      const base64 = input.data.match(/^data:image\/png;base64,(.+)$/)?.[1]
      if (!base64) return yield* Effect.die(new Error("Expected a PNG data URL"))
      const relative = path.join(".opencode", "design-comments", `${input.id.replace(/[^\w-]/g, "")}.png`)
      const file = path.join(path.resolve(input.directory), relative)
      yield* Effect.promise(() => mkdir(path.dirname(file), { recursive: true }))
      yield* Effect.promise(() => writeFile(file, Buffer.from(base64, "base64")))
      return relative.replaceAll("\\", "/")
    })

  return {
    record,
    saveShot,
    list,
    create,
    detect,
    history,
    restore,
    remove: (id: string) =>
      Effect.gen(function* () {
        const versions = yield* ctx.storage.scan({ prefix: `${VERSION}${id}:`, limit: 500 })
        yield* Effect.forEach(versions.entries, (entry) => ctx.storage.remove(entry.key), { discard: true })
        yield* ctx.storage.remove(ENTRY + id)
        return true
      }),
  }
}

const manifestName = (slug: string) => (slug === "design" ? "design.json" : `generated-${slug}.design.json`)

const createInput = Schema.Struct({
  directory: Schema.String,
  kind: Artifacts.Kind,
  name: Schema.String,
  folder: Schema.optional(Schema.String),
  sessionID: Schema.optional(Schema.String),
})

const extension = (kind: Exclude<RegistryKind, "design">) =>
  ({ html: ".html", markdown: ".md", slides: ".slides.md", svg: ".svg", csv: ".csv", pdf: ".pdf", image: ".png" })[kind]

/** Writes the starter file for a new artifact without overwriting an existing one; returns the path to show. */
async function place(folder: string, kind: RegistryKind, title: string, slug: string) {
  if (kind === "design") {
    const unique = uniqueSlug(slug, (candidate) => existsSync(path.join(folder, candidate)))
    const dir = path.join(folder, unique)
    const starter = starterDesign(title)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, "index.html"), starter.page)
    await writeFile(path.join(dir, "design.json"), starter.manifest)
    return path.join(dir, "design.json")
  }
  if (kind === "pdf" || kind === "image") throw new Error("Create a PDF or image by asking the agent")
  const ext = extension(kind)
  const unique = uniqueSlug(slug, (candidate) => existsSync(path.join(folder, candidate + ext)))
  const file = path.join(folder, unique + ext)
  await writeFile(file, starterContent(kind, title))
  return file
}

/** Project-relative file paths, skipping dependency and build folders. */
function walk(root: string, limit = 3000) {
  const files: string[] = []
  const visit = (relative: string, depth: number) => {
    if (files.length >= limit || depth > 4) return
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue
      const child = relative ? `${relative}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(child, depth + 1)
      else files.push(child)
    }
  }
  visit("", 0)
  return files
}

export function register(ctx: Context) {
  const registry = make(ctx)
  return ctx.rpc.register(Artifacts.Definition, {
    list: () => registry.list,
    record: (input) => registry.record(input),
    create: (input) => registry.create(input),
    remove: ({ id }) => registry.remove(id),
    history: ({ id }) => registry.history(id),
    restore: ({ id, n }) => registry.restore(id, n),
    detect: (input) => registry.detect(input),
    saveShot: (input) => registry.saveShot(input),
  })
}
