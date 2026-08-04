export type GalleryShortcutRow = {
  keys: string[]
  action: string
}

/** Wall (lightbox closed) shortcuts. */
export const GALLERY_WALL_SHORTCUTS: GalleryShortcutRow[] = [
  { keys: ["J", "→"], action: "Next photo" },
  { keys: ["K", "←"], action: "Previous photo" },
  { keys: ["Enter"], action: "Open lightbox" },
  { keys: ["?"], action: "Toggle this cheat sheet" },
]

/** Lightbox shortcuts. */
export const GALLERY_LIGHTBOX_SHORTCUTS: GalleryShortcutRow[] = [
  { keys: ["←", "→"], action: "Prev / next (sequence, then wall)" },
  { keys: ["I"], action: "Toggle comments panel (mobile)" },
  { keys: ["Esc"], action: "Close" },
  { keys: ["?"], action: "Toggle this cheat sheet" },
]

export function isCheatSheetToggleKey(key: string, shiftKey: boolean): boolean {
  // "?" comes through as Shift+/ on most layouts; some send key === "?"
  return key === "?" || (key === "/" && shiftKey)
}
