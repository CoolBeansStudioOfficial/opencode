import { describe, expect, test } from "bun:test"
import path from "node:path"
import { filePath, framePrefix, injectInspector, issue, parseFramePath, resolve } from "./design-ticket.js"

describe("design tickets", () => {
  test("issue reuses a live ticket for the same grant and expires after a day", () => {
    const root = path.resolve("/project")
    const ticket = issue({ kind: "file", root }, 0)

    expect(issue({ kind: "file", root }, 1)).toBe(ticket)
    expect(issue({ kind: "live", port: 5173 }, 1)).not.toBe(ticket)
    expect(resolve(ticket, 2)).toEqual({ kind: "file", root })
    expect(resolve(ticket, 24 * 60 * 60_000 + 1)).toBeUndefined()
    expect(resolve("missing-ticket-value-xxxxx")).toBeUndefined()
  })

  test("file paths stay inside the granted folder", () => {
    const root = path.resolve("/project")

    expect(filePath(root, "/designs/home.html")).toBe(path.join(root, "designs", "home.html"))
    expect(filePath(root, "/a%20b.css")).toBe(path.join(root, "a b.css"))
    expect(filePath(root, "/../secret.txt")).toBeUndefined()
    expect(filePath(root, "/designs/%2e%2e/%2e%2e/secret.txt")).toBeUndefined()
  })

  test("frame paths, referer prefixes and inspector injection", () => {
    const ticket = "abcdefghijklmnopqrstuvwx"

    expect(parseFramePath(`/design/${ticket}/file/designs/home.html`)).toEqual({
      ticket,
      port: undefined,
      rest: "/designs/home.html",
    })
    expect(parseFramePath(`/design/${ticket}/live/5173`)).toEqual({ ticket, port: 5173, rest: "/" })
    expect(parseFramePath("/design/short/file/x")).toBeUndefined()
    expect(framePrefix(`http://h/design/${ticket}/live/5173/src/main.tsx`)).toBe(`/design/${ticket}/live/5173`)
    expect(framePrefix("http://h/settings")).toBeUndefined()
    expect(injectInspector("<html><head><title>x</title></head></html>")).toBe(
      '<html><head><script src="/design-inspector.js"></script><title>x</title></head></html>',
    )
    expect(injectInspector("<p>hi</p>")).toBe('<script src="/design-inspector.js"></script><p>hi</p>')
  })
})
