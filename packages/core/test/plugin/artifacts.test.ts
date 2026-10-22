import { describe, expect, test } from "bun:test"
import { ArtifactsRegistry } from "@opencode/core/plugin/artifacts"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect } from "effect"
import { mkdtempSync, readFileSync, utimesSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// An in-memory StorageDomain: the registry only uses `ctx.storage`.
function registry() {
  const map = new Map<string, unknown>()
  const storage = {
    get: (key: string) => Effect.sync(() => map.get(key)),
    set: (key: string, value: unknown) => Effect.sync(() => void map.set(key, value)),
    remove: (key: string) => Effect.sync(() => void map.delete(key)),
    scan: (options: { prefix: string }) =>
      Effect.sync(() => ({
        entries: [...map.entries()].filter(([key]) => key.startsWith(options.prefix)).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, value })),
      })),
  }
  return ArtifactsRegistry.make({ storage } as unknown as Context)
}

const run = Effect.runPromise
const dir = () => mkdtempSync(path.join(tmpdir(), "artifacts-"))

describe("artifact registry", () => {
  test("records, versions edits, restores and removes", async () => {
    const root = dir()
    try {
      const r = registry()
      const file = path.join(root, "page.html")
      writeFileSync(file, "<h1>one</h1>")
      const first = await run(r.record({ path: file, directory: root, title: "Page", sessionID: "ses_1" }))
      expect(first).toMatchObject({ kind: "html", title: "Page", versions: 1, sessionID: "ses_1", missing: false })

      // Re-showing an unchanged file adds nothing.
      expect((await run(r.record({ path: file, directory: root })))?.versions).toBe(1)

      writeFileSync(file, "<h1>two</h1>")
      utimesSync(file, new Date(), new Date(Date.now() + 5000))
      const listed = await run(r.list)
      expect(listed.map((e) => [e.title, e.versions])).toEqual([["Page", 2]])

      const history = await run(r.history(first!.id))
      expect(history.map((v) => v.n)).toEqual([2, 1])

      await run(r.restore(first!.id, 1))
      expect(readFileSync(file, "utf8")).toBe("<h1>one</h1>")
      expect((await run(r.list))[0]!.versions).toBe(3)

      await run(r.remove(first!.id))
      expect(await run(r.list)).toEqual([])
      expect(readFileSync(file, "utf8")).toBe("<h1>one</h1>")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("ignores files that are not artifacts and flags deleted ones", async () => {
    const root = dir()
    try {
      const r = registry()
      writeFileSync(path.join(root, "a.ts"), "x")
      expect(await run(r.record({ path: path.join(root, "a.ts"), directory: root }))).toBeNull()
      const file = path.join(root, "gone.md")
      writeFileSync(file, "# hi")
      await run(r.record({ path: file, directory: root }))
      rmSync(file)
      expect((await run(r.list))[0]!.missing).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("creates starters without overwriting and keeps them inside the project", async () => {
    const root = dir()
    try {
      const r = registry()
      const a = await run(r.create({ directory: root, kind: "html", name: "Landing Page" }))
      const b = await run(r.create({ directory: root, kind: "html", name: "Landing Page" }))
      expect([a.path, b.path].map((file) => path.relative(root, file))).toEqual([
        path.join("artifacts", "landing-page.html"),
        path.join("artifacts", "landing-page-2.html"),
      ])
      const design = await run(r.create({ directory: root, kind: "design", name: "Shop", folder: "ui" }))
      expect(design.kind).toBe("design")
      expect(JSON.parse(readFileSync(design.path, "utf8")).frames[0].file).toBe("index.html")
      expect(readFileSync(path.join(path.dirname(design.path), "index.html"), "utf8")).toContain("<h1>Shop</h1>")
      const deck = await run(r.create({ directory: root, kind: "slides", name: "Pitch" }))
      expect(deck.path.endsWith("pitch.slides.md")).toBe(true)
      await expect(run(r.create({ directory: root, kind: "html", name: "x", folder: "../outside" }))).rejects.toThrow()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("detect writes a design next to, never over, an existing one", async () => {
    const root = dir()
    try {
      const r = registry()
      writeFileSync(path.join(root, "index.html"), "<p>hi</p>")
      writeFileSync(path.join(root, "design.json"), '{"name":"mine","frames":[]}')
      const result = await run(r.detect({ directory: root }))
      expect(result.file).toBe("generated-design-2.design.json")
      expect(result.frames).toBe(2)
      expect(readFileSync(path.join(root, "design.json"), "utf8")).toBe('{"name":"mine","frames":[]}')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
