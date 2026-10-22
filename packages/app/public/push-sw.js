// Fork: web push handlers, imported by the generated service worker. Payloads follow Push.Payload in
// packages/schema/src/push.ts.

const visibleClient = async () => {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })

  return clients.find((client) => client.visibilityState === "visible" && client.focused)
}

self.addEventListener("push", (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : undefined
    } catch {
      return undefined
    }
  })()

  if (!payload || typeof payload.title !== "string") return

  event.waitUntil(
    (async () => {
      // Someone is already looking at the app on this device; the in-app status is enough.
      if (payload.kind !== "test" && (await visibleClient())) return

      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/favicon-96x96-v3.png",
        badge: "/favicon-96x96-v3.png",
        tag: payload.sessionID ? `session:${payload.sessionID}` : payload.kind,
        renotify: payload.kind === "permission" || payload.kind === "question",
        requireInteraction: payload.kind === "permission" || payload.kind === "question",
        data: { sessionID: payload.sessionID, directory: payload.directory },
      })
    })(),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const sessionID = event.notification.data && event.notification.data.sessionID
  const target = new URL(sessionID ? `/?session=${encodeURIComponent(sessionID)}` : "/", self.location.origin).href

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const existing = clients.find((client) => new URL(client.url).origin === self.location.origin)

      if (existing) {
        await existing.focus()
        if (sessionID) existing.postMessage({ type: "opencode.push.open", sessionID })

        return
      }

      await self.clients.openWindow(target)
    })(),
  )
})
