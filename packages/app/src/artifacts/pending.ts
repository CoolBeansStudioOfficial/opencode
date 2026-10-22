import { createSignal } from "solid-js"

// Fork: an artifact opened from the Artifacts page or a transcript card waits here until its session is on screen;
// `SessionArtifactOpener` then opens the file in that session's side panel.
const [pending, setPending] = createSignal<{ sessionID: string; path: string }>()

export const pendingArtifact = pending

export const queueArtifactOpen = (sessionID: string, path: string) => setPending({ sessionID, path })

export const clearPendingArtifact = () => setPending(undefined)
