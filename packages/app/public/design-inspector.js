// Fork: design canvas inspector. Injected into every design frame (mockups and proxied live sites). In comment mode
// it outlines the element under the pointer; a click reports that element to the canvas, which attaches it to the
// composer. The parent talks to it with postMessage only, so it also works for frames it cannot script directly.
;(() => {
  if (window.__ocDesignInspector) return
  window.__ocDesignInspector = true

  const PREFIX = "oc-design."
  let commenting = false
  let outline
  let label

  const post = (type, data) => window.parent?.postMessage({ type: PREFIX + type, ...data }, "*")

  const ensureOverlay = () => {
    if (outline) return
    outline = document.createElement("div")
    label = document.createElement("div")
    for (const node of [outline, label]) {
      node.setAttribute("data-oc-design-overlay", "")
      node.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483647;display:none;box-sizing:border-box;"
    }
    outline.style.cssText += "border:2px solid #D97757;background:rgba(217,119,87,0.08);border-radius:2px;"
    label.style.cssText +=
      "background:#D97757;color:#fff;font:600 11px/16px system-ui,sans-serif;padding:0 6px;border-radius:3px;white-space:nowrap;"
    document.documentElement.append(outline, label)
  }

  const hide = () => {
    if (outline) outline.style.display = "none"
    if (label) label.style.display = "none"
  }

  const selector = (element) => {
    const parts = []
    let node = element

    while (node && node.nodeType === 1 && node !== document.documentElement && parts.length < 6) {
      if (node.id && !/\d{3,}/.test(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`)
        break
      }
      const tag = node.localName
      const parent = node.parentElement
      const siblings = parent ? [...parent.children].filter((child) => child.localName === tag) : []
      const stable = [...node.classList].filter((name) => /^[a-zA-Z][\w-]{1,30}$/.test(name) && !/\d{3,}/.test(name))
      let part = tag + stable.slice(0, 2).map((name) => `.${CSS.escape(name)}`).join("")
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`
      parts.unshift(part)
      node = parent
    }

    return parts.join(" > ")
  }

  const describe = (element) => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const html = element.outerHTML

    return {
      selector: selector(element),
      tag: element.localName,
      text: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 300),
      html: html.length > 1500 ? `${html.slice(0, 1500)}…` : html,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      styles: {
        color: style.color,
        background: style.backgroundColor,
        font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily.split(",")[0]}`,
        padding: style.padding,
        margin: style.margin,
        radius: style.borderRadius,
      },
      url: location.href,
    }
  }

  const target = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY)

    return element && !element.hasAttribute("data-oc-design-overlay") ? element : undefined
  }

  const show = (element) => {
    ensureOverlay()
    const rect = element.getBoundingClientRect()
    Object.assign(outline.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    label.textContent = selector(element).split(" > ").pop()
    Object.assign(label.style, {
      display: "block",
      left: `${Math.max(0, rect.left)}px`,
      top: `${rect.top > 18 ? rect.top - 18 : rect.bottom + 2}px`,
    })
  }

  document.addEventListener(
    "mousemove",
    (event) => {
      if (!commenting) return
      const element = target(event)
      if (element) show(element)
    },
    true,
  )

  // Capture clicks before the page's own handlers so links and buttons don't fire while commenting.
  for (const type of ["click", "mousedown", "mouseup", "pointerdown", "pointerup"]) {
    document.addEventListener(
      type,
      (event) => {
        if (!commenting) return
        event.preventDefault()
        event.stopImmediatePropagation()
        if (type !== "click") return
        const element = target(event)
        if (element) post("select", { element: describe(element) })
      },
      true,
    )
  }

  document.addEventListener(
    "keydown",
    (event) => {
      if (commenting && event.key === "Escape") {
        commenting = false
        hide()
        post("mode", { commenting: false })
      }
    },
    true,
  )

  window.addEventListener("message", (event) => {
    const data = event.data
    if (!data || typeof data.type !== "string" || !data.type.startsWith(PREFIX)) return
    if (data.type === PREFIX + "comment") {
      commenting = !!data.enabled
      document.documentElement.style.cursor = commenting ? "crosshair" : ""
      if (!commenting) hide()
    }
  })

  const ready = () => post("ready", { url: location.href, title: document.title })
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready)
  else ready()
})()
