import { describe, expect, test } from "bun:test"
import { detectDesign, registryKind, slugify, uniqueSlug } from "./artifact-registry.js"

describe("registryKind", () => {
  test.each([
    ["a/design.json", "design"],
    ["x.design.json", "design"],
    ["deck.slides.md", "slides"],
    ["notes.md", "markdown"],
    ["page.HTML", "html"],
    ["logo.svg", "svg"],
    ["data.tsv", "csv"],
    ["paper.pdf", "pdf"],
    ["shot.png", "image"],
    ["package.json", undefined],
    ["src/app.ts", undefined],
  ] as const)("%s", (file, kind) => expect(registryKind(file)).toBe(kind))
})

describe("names", () => {
  test("slugify", () => {
    expect(slugify("  Pricing Page! v2 ")).toBe("pricing-page-v2")
    expect(slugify("???")).toBe("untitled")
  })
  test("uniqueSlug counts up past taken names", () => {
    const taken = new Set(["a", "a-2"])
    expect(uniqueSlug("a", (c) => taken.has(c))).toBe("a-3")
    expect(uniqueSlug("b", (c) => taken.has(c))).toBe("b")
  })
})

describe("detectDesign", () => {
  const read = (files: Record<string, string>) => (file: string) => files[file]

  test("static html pages become file frames with a phone variant for the first", () => {
    const design = detectDesign({
      name: "site",
      files: ["index.html", "about/index.html", "node_modules/x/index.html", "style.css"],
      read: read({}),
    })
    expect(design.frames.map((frame) => [frame.name, frame.file, frame.width])).toEqual([
      ["Home", "index.html", undefined],
      ["Home · phone", "index.html", 390],
      ["About", "about/index.html", undefined],
    ])
  })

  test("router config wins over page files, dynamic routes are skipped and the port comes from the server file", () => {
    const design = detectDesign({
      name: "site",
      files: ["src/lib/router.js", "src/pages/home.js", "src/pages/about.js", "serve.mjs", "src/styles/tokens.css"],
      read: read({
        "src/lib/router.js": "{ path: '/', module: 'a' }, { path: '/game/:id', module: 'b' }, { path: '/search', module: 'c' }",
        "serve.mjs": "const port = Number(process.argv[2] || process.env.PORT || 5173);",
        "src/styles/tokens.css": ":root { --brand: red; }",
      }),
    })
    expect(design.system).toBe("src/styles/tokens.css")
    expect(design.frames.map((frame) => frame.url)).toEqual([
      "http://localhost:5173/",
      "http://localhost:5173/",
      "http://localhost:5173/search",
    ])
  })

  test("file-based routing and an explicit dev-server url", () => {
    const design = detectDesign({
      name: "app",
      files: ["src/routes/index.tsx", "src/routes/pricing.tsx", "src/routes/[id].tsx", "src/routes/api/x.ts"],
      read: read({}),
      url: "http://localhost:3000/anything",
    })
    expect(design.frames.filter((frame) => !frame.width).map((frame) => frame.url)).toEqual([
      "http://localhost:3000/",
      "http://localhost:3000/pricing",
    ])
  })
})
