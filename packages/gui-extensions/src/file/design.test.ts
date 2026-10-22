import { describe, expect, test } from "bun:test"
import { designBounds, designTokens, isDesign, localPort, parseDesign } from "./design"

describe("parseDesign", () => {
  test("flows unpositioned frames left to right and drops frames without a source", () => {
    const design = parseDesign(
      JSON.stringify({
        name: "Checkout",
        system: "../system",
        frames: [
          { name: "Desktop", file: "desktop.html" },
          { name: "Mobile", file: "mobile.html", width: 390, height: 844 },
          { name: "Empty" },
          { name: "Live", url: "http://localhost:5173/checkout", x: 0, y: 1200 },
        ],
      }),
    )

    expect(design).toEqual({
      name: "Checkout",
      system: "../system",
      frames: [
        { id: "0", name: "Desktop", source: { kind: "file", path: "desktop.html" }, width: 1440, height: 900, x: 0, y: 0 },
        { id: "1", name: "Mobile", source: { kind: "file", path: "mobile.html" }, width: 390, height: 844, x: 1560, y: 0 },
        {
          id: "3",
          name: "Live",
          source: { kind: "url", url: "http://localhost:5173/checkout" },
          width: 1440,
          height: 900,
          x: 0,
          y: 1200,
        },
      ],
    })
  })

  test("reports invalid manifests", () => {
    expect(parseDesign("{ not json")).toHaveProperty("error")
    expect(parseDesign(JSON.stringify({ frames: "nope" }))).toHaveProperty("error")
  })
})

describe("design helpers", () => {
  test("bounds, manifest names and loopback detection", () => {
    const frames = parseDesign(JSON.stringify({ frames: [{ name: "A", file: "a.html", width: 100, height: 50, x: 10, y: 20 }] }))

    expect("frames" in frames && designBounds(frames.frames)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(isDesign("designs/home/design.json")).toBe(true)
    expect(isDesign("designs\\home\\design.json")).toBe(true)
    expect(isDesign("landing.design.json")).toBe(true)
    expect(isDesign("package.json")).toBe(false)
    expect(localPort("http://localhost:5173/a?b=1")).toEqual({ port: 5173, path: "/a?b=1" })
    expect(localPort("https://example.com/")).toBeUndefined()
  })
})

describe("designTokens", () => {
  test("reads custom properties, ignoring comments and keeping the last value", () => {
    expect(
      designTokens(":root { --brand: #D97757; /* --hidden: red; */ --space-2: 8px }\n.dark { --brand: #E89275; }"),
    ).toEqual([
      { name: "--brand", value: "#E89275" },
      { name: "--space-2", value: "8px" },
    ])
  })
})
