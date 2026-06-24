export const GALLERY_SEASONAL_THEME_KEY = "seasonal_theme" as const

export type GallerySeasonalThemeId = "dragon-boat" | "world-cup"

export type GallerySeasonalTheme = {
  id: GallerySeasonalThemeId
  label: string
  badge: string
  description: string
}

export const GALLERY_SEASONAL_THEMES: Record<
  GallerySeasonalThemeId,
  GallerySeasonalTheme
> = {
  "dragon-boat": {
    id: "dragon-boat",
    label: "Dragon Boat Festival",
    badge: "端午",
    description:
      "Dragon boat header, green wash, waterline, zongzi easter egg, and 端午安康 footer.",
  },
  "world-cup": {
    id: "world-cup",
    label: "World Cup",
    badge: "世足",
    description:
      "Pitch-green palette, rolling football header, turf stripe, kickable ⚽ easter egg, and 加油 footer.",
  },
}

export const GALLERY_SEASONAL_THEME_IDS = Object.keys(
  GALLERY_SEASONAL_THEMES
) as GallerySeasonalThemeId[]

export function isGallerySeasonalThemeId(
  value: unknown
): value is GallerySeasonalThemeId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GALLERY_SEASONAL_THEMES, value)
  )
}

/** Local dev preview when gallery_settings migration is not applied yet. */
export function getSeasonalThemeEnvOverride(): GallerySeasonalThemeId | null {
  const raw = process.env.GALLERY_SEASONAL_THEME?.trim()
  if (!raw || raw === "off" || raw === "none") return null
  return isGallerySeasonalThemeId(raw) ? raw : null
}

export function parseSeasonalThemeSetting(
  value: unknown
): GallerySeasonalThemeId | null {
  if (!value || typeof value !== "object") return null
  const id = (value as { id?: unknown }).id
  if (id === null || id === undefined) return null
  return isGallerySeasonalThemeId(id) ? id : null
}
