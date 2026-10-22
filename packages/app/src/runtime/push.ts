import { Push } from "@opencode/schema/push"
import type { ServerSDK } from "@/runtime/server/client"

// Fork: web push on this device. Needs a secure context (https, or localhost) and the production service worker,
// which the server's built web UI registers; the Vite dev server has none.

export type PushState = "unsupported" | "no-worker" | "denied" | "off" | "on"

const registration = async () => navigator.serviceWorker?.getRegistration().catch(() => undefined)

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext || !("PushManager" in window) || !("Notification" in window)) return "unsupported"
  const worker = await registration()

  if (!worker) return "no-worker"

  if (Notification.permission === "denied") return "denied"

  return (await worker.pushManager.getSubscription()) ? "on" : "off"
}

function applicationServerKey(base64url: string) {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=")

  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

function subscription(value: PushSubscription): Push.Subscription {
  const json = value.toJSON()

  return { endpoint: value.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" } }
}

export async function enablePush(api: ServerSDK["api"]) {
  const worker = await registration()

  if (!worker) throw new Error("No service worker is registered on this page")

  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notifications are blocked for this site")
  const rpc = api.rpc(Push.Definition)
  const key = await rpc.key({})
  const existing = await worker.pushManager.getSubscription()

  // A subscription made for another server's key cannot receive this server's pushes.
  if (existing) await existing.unsubscribe()
  const created = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(key) })
  await rpc.subscribe(subscription(created))

  return created.endpoint
}

export async function disablePush(api: ServerSDK["api"]) {
  const current = await (await registration())?.pushManager.getSubscription()

  if (!current) return
  await api.rpc(Push.Definition).unsubscribe({ endpoint: current.endpoint }).catch(() => false)
  await current.unsubscribe()
}

export async function testPush(api: ServerSDK["api"]) {
  const current = await (await registration())?.pushManager.getSubscription()

  if (!current) return false

  return api.rpc(Push.Definition).test({ endpoint: current.endpoint })
}
