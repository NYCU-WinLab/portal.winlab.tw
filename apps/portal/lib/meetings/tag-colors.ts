import type { CSSProperties } from "react"

// Preset palette an admin picks from when creating a tag. Kept small on purpose
// so tags stay visually distinct instead of a rainbow of near-identical hues.
export const TAG_COLORS = [
  { name: "石板", value: "#64748b" },
  { name: "紅", value: "#ef4444" },
  { name: "橙", value: "#f97316" },
  { name: "琥珀", value: "#f59e0b" },
  { name: "綠", value: "#10b981" },
  { name: "青", value: "#14b8a6" },
  { name: "藍", value: "#3b82f6" },
  { name: "靛", value: "#6366f1" },
  { name: "紫", value: "#8b5cf6" },
  { name: "粉", value: "#ec4899" },
] as const

export const DEFAULT_TAG_COLOR = TAG_COLORS[0].value

/**
 * Chip styling from a tag's hex colour. `selected` fills the chip; otherwise it
 * reads as a tint (colour text on a faint colour wash) that works on both light
 * and dark grounds — the alpha suffixes ride on the CSS variable ground.
 */
export function tagChipStyle(
  color: string | null,
  selected = false
): CSSProperties {
  const c = color ?? DEFAULT_TAG_COLOR
  if (selected) {
    return { backgroundColor: c, borderColor: c, color: "#ffffff" }
  }
  return { backgroundColor: `${c}1f`, borderColor: `${c}59`, color: c }
}
