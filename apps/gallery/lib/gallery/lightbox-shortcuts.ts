/**
 * Lightbox keyboard shortcut resolution (pure) — keeps gallery-card handlers thin.
 */

export type LightboxShortcutAction =
  | "prev"
  | "next"
  | "first"
  | "last"
  | "toggle-details"
  | "share"
  | "favorite"
  | "download"
  | "react"
  | null

export function resolveLightboxShortcut(
  key: string,
  opts: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {}
): LightboxShortcutAction {
  if (opts.metaKey || opts.ctrlKey || opts.altKey) return null
  if (key === "ArrowLeft") return "prev"
  if (key === "ArrowRight") return "next"
  if (key === "Home") return "first"
  if (key === "End") return "last"
  if (key === "i" || key === "I") return "toggle-details"
  if (key === "s" || key === "S") return "share"
  if (key === "f" || key === "F") return "favorite"
  if (key === "d" || key === "D") return "download"
  if (key === "r" || key === "R") return "react"
  return null
}
