export const GALLERY_SEASONAL_THEME_KEY = "seasonal_theme" as const

export type GallerySeasonalThemeId = "dragon-boat"

export type GallerySeasonalTheme = {
  id: GallerySeasonalThemeId
  label: string
  description: string
}

export const GALLERY_SEASONAL_THEMES: Record<
  GallerySeasonalThemeId,
  GallerySeasonalTheme
> = {
  "dragon-boat": {
    id: "dragon-boat",
    label: "Dragon Boat Festival",
    description:
      "Dragon boat header, green wash, pagination and manage panels, lightbox stripe, and waterline.",
  },
}

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
