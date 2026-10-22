import { createSignal } from "solid-js"

// Whether the session info column is open. It still needs a wide window to show; see SessionScreen.
const [infoOpen, setInfoOpen] = createSignal(true)

export const sessionInfo = { open: infoOpen, toggle: () => setInfoOpen(!infoOpen()) }
