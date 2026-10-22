import { createSignal } from "solid-js"

// Whether the session info column is open. It still needs a wide window to show; see SessionScreen.
const key = "opencode.session-info.open"
const [infoOpen, setInfoOpen] = createSignal(localStorage.getItem(key) !== "0")

export const sessionInfo = {
  open: infoOpen,
  toggle: () => {
    setInfoOpen(!infoOpen())
    localStorage.setItem(key, infoOpen() ? "1" : "0")
  },
}

