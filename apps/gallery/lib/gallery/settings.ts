import type { SupabaseClient } from "@supabase/supabase-js"

import {
  GALLERY_SEASONAL_THEME_KEY,
  type GallerySeasonalThemeId,
  getSeasonalThemeEnvOverride,
  parseSeasonalThemeSetting,
} from "@/lib/gallery/seasonal-themes"

/** Migration not applied yet — fail quietly instead of spamming the console. */
export function isGallerySettingsUnavailable(
  error: {
    code?: string
    message?: string
  } | null
): boolean {
  if (!error) return false
  const code = error.code ?? ""
  const message = error.message ?? ""
  return (
    code === "PGRST205" ||
    code === "42P01" ||
    /gallery_settings/i.test(message) ||
    /schema cache/i.test(message)
  )
}

export async function isGallerySettingsReady(
  supabase: SupabaseClient
): Promise<boolean> {
  const { error } = await supabase
    .from("gallery_settings")
    .select("key")
    .limit(1)
  if (!error) return true
  return !isGallerySettingsUnavailable(error)
}

export async function getGallerySeasonalThemeId(
  supabase: SupabaseClient
): Promise<GallerySeasonalThemeId | null> {
  const { data, error } = await supabase
    .from("gallery_settings")
    .select("value")
    .eq("key", GALLERY_SEASONAL_THEME_KEY)
    .maybeSingle()

  if (!error) {
    // Row exists — DB wins (including explicit off via { id: null }).
    if (data !== null) {
      return parseSeasonalThemeSetting(data.value)
    }
    // Table ready but row not seeded — dev env preview only.
    if (process.env.NODE_ENV === "development") {
      return getSeasonalThemeEnvOverride()
    }
    return null
  }

  if (isGallerySettingsUnavailable(error)) {
    if (process.env.NODE_ENV === "development") {
      return getSeasonalThemeEnvOverride()
    }
    return null
  }

  console.error(
    "[gallery] failed to load seasonal theme:",
    error.message ?? error.code
  )
  return null
}

export async function setGallerySeasonalThemeId(
  supabase: SupabaseClient,
  themeId: GallerySeasonalThemeId | null,
  updatedBy: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.from("gallery_settings").upsert(
    {
      key: GALLERY_SEASONAL_THEME_KEY,
      value: { id: themeId },
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" }
  )

  if (error) {
    if (isGallerySettingsUnavailable(error)) {
      return {
        ok: false,
        error:
          "Theme settings are not ready yet — apply the gallery_settings migration on Supabase.",
      }
    }
    return { ok: false, error: error.message }
  }

  return { ok: true }
}
