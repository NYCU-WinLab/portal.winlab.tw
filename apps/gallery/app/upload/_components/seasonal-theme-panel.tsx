"use client"

import { useState, useTransition } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { setGallerySeasonalTheme } from "@/app/actions"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import {
  GALLERY_SEASONAL_THEME_IDS,
  GALLERY_SEASONAL_THEMES,
  type GallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"

type ThemeChoice = GallerySeasonalThemeId | "off"

const THEME_OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: "off", label: "Off" },
  ...GALLERY_SEASONAL_THEME_IDS.map((id) => ({
    value: id,
    label: GALLERY_SEASONAL_THEMES[id].label,
  })),
]

export function SeasonalThemePanel({
  activeThemeId,
  settingsReady = true,
}: {
  activeThemeId: GallerySeasonalThemeId | null
  settingsReady?: boolean
}) {
  const [selected, setSelected] = useState<ThemeChoice>(activeThemeId ?? "off")
  const [isPending, startTransition] = useTransition()

  const onSelect = (next: ThemeChoice) => {
    const previous = selected
    setSelected(next)
    startTransition(async () => {
      const themeId = next === "off" ? null : next
      const result = await setGallerySeasonalTheme(themeId)
      if (!result.ok) {
        setSelected(previous)
        toast.error(result.error)
        return
      }
      if (themeId) {
        toast.success(`${GALLERY_SEASONAL_THEMES[themeId].label} theme is on.`)
      } else {
        toast.success("Seasonal theme off.")
      }
    })
  }

  return (
    <section className={galleryPanelClass()}>
      <div className="space-y-1">
        <h2 className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}>
          Site theme
        </h2>
        <p className={gallerySectionLeadClass()}>
          Pick a limited-time look for everyone visiting the gallery wall.
        </p>
      </div>

      <div
        className={cn(
          gallerySans(),
          "mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        )}
        role="radiogroup"
        aria-label="Seasonal site theme"
      >
        {THEME_OPTIONS.map((option) => {
          const checked = selected === option.value

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={isPending}
              onClick={() => onSelect(option.value)}
              className={cn(
                "min-w-[8.5rem] flex-1 rounded-xl border px-4 py-3 text-left transition-colors",
                checked
                  ? "border-foreground/25 bg-foreground/[0.07] text-foreground"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:border-foreground/15 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          )
        })}
      </div>

      {!settingsReady ? (
        <p
          className={cn(
            gallerySans(),
            "mt-3 text-xs text-amber-800 dark:text-amber-200"
          )}
        >
          Database settings not ready — apply{" "}
          <code className="text-[10px]">2026-06-12-gallery-settings.sql</code>,
          or set{" "}
          <code className="text-[10px]">GALLERY_SEASONAL_THEME=world-cup</code>{" "}
          in <code className="text-[10px]">.env.local</code> for local preview.
        </p>
      ) : null}
    </section>
  )
}
