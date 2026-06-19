"use client"

import { useState, useTransition } from "react"

import { Switch } from "@workspace/ui/components/switch"
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
  GALLERY_SEASONAL_THEMES,
  type GallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"

export function SeasonalThemePanel({
  activeThemeId,
  settingsReady = true,
}: {
  activeThemeId: GallerySeasonalThemeId | null
  settingsReady?: boolean
}) {
  const theme = GALLERY_SEASONAL_THEMES["dragon-boat"]
  const [enabled, setEnabled] = useState(activeThemeId === theme.id)
  const [isPending, startTransition] = useTransition()

  const onToggle = (next: boolean) => {
    setEnabled(next)
    startTransition(async () => {
      const result = await setGallerySeasonalTheme(next ? theme.id : null)
      if (!result.ok) {
        setEnabled(!next)
        toast.error(result.error)
        return
      }
      toast.success(
        next ? `${theme.label} theme is on.` : "Seasonal theme off."
      )
    })
  }

  return (
    <section className={galleryPanelClass()}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2
            className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}
          >
            Site theme
          </h2>
          <p className={gallerySectionLeadClass()}>
            Toggle a limited-time look for everyone visiting the gallery wall.
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={isPending}
          onCheckedChange={onToggle}
          aria-label={`${theme.label} theme`}
        />
      </div>
      <div
        className={cn(
          gallerySans(),
          "mt-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3"
        )}
      >
        <p className="text-sm font-medium text-foreground">{theme.label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {theme.description}
        </p>
        {!settingsReady ? (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
            Database settings not ready — apply{" "}
            <code className="text-[10px]">2026-06-12-gallery-settings.sql</code>
            , or set{" "}
            <code className="text-[10px]">
              GALLERY_SEASONAL_THEME=dragon-boat
            </code>{" "}
            in <code className="text-[10px]">.env.local</code> for local
            preview.
          </p>
        ) : null}
      </div>
    </section>
  )
}
