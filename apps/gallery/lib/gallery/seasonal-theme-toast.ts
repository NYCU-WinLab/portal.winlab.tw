import {
  GALLERY_SEASONAL_THEMES,
  type GallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"

/** Toast title after changing the gallery seasonal theme setting. */
export function describeSeasonalThemeToast(
  themeId: GallerySeasonalThemeId | null
): string {
  if (themeId) {
    return `${GALLERY_SEASONAL_THEMES[themeId].label} theme is on.`
  }
  return "Back to paper wall."
}
