export type GalleryShortcutRow = {
  keys: string[]
  action: string
}

/** Wall (lightbox closed) shortcuts. */
export const GALLERY_WALL_SHORTCUTS: GalleryShortcutRow[] = [
  { keys: ["J", "→"], action: "Next photo" },
  { keys: ["K", "←"], action: "Previous photo" },
  { keys: ["Enter"], action: "Open lightbox" },
  { keys: ["Space"], action: "Toggle select (in Select mode)" },
  { keys: ["A"], action: "Select all / clear all" },
  { keys: ["Shift+click"], action: "Range-select from last toggle" },
  { keys: ["Esc"], action: "Exit Select mode" },
  { keys: ["?"], action: "Toggle this cheat sheet" },
]

/** Lightbox shortcuts. */
export const GALLERY_LIGHTBOX_SHORTCUTS: GalleryShortcutRow[] = [
  { keys: ["←", "→"], action: "Prev / next (sequence, then wall)" },
  { keys: ["Home", "End"], action: "First / last shot in sequence" },
  { keys: ["F"], action: "Toggle favorite" },
  { keys: ["D"], action: "Download original" },
  { keys: ["S"], action: "Share link" },
  { keys: ["I"], action: "Toggle comments panel (mobile)" },
  { keys: ["Esc"], action: "Close" },
  { keys: ["?"], action: "Toggle this cheat sheet" },
]

/** Album / Memories slideshow shortcuts. */
export const GALLERY_SLIDESHOW_SHORTCUTS: GalleryShortcutRow[] = [
  { keys: ["Space"], action: "Pause / resume" },
  { keys: ["click"], action: "Pause / resume (photo)" },
  { keys: ["[", "]"], action: "Slower / faster" },
  { keys: ["←", "→"], action: "Previous / next slide" },
  { keys: ["swipe"], action: "Previous / next (touch)" },
  { keys: ["J", "K"], action: "Next / previous (vim)" },
  { keys: ["Home", "End"], action: "First / last slide" },
  { keys: ["1–9", "0"], action: "Jump ~10%…90% / last" },
  { keys: ["Esc"], action: "Close slideshow" },
  { keys: ["?"], action: "Toggle this cheat sheet" },
]

export function isCheatSheetToggleKey(key: string, shiftKey: boolean): boolean {
  // "?" comes through as Shift+/ on most layouts; some send key === "?"
  return key === "?" || (key === "/" && shiftKey)
}
