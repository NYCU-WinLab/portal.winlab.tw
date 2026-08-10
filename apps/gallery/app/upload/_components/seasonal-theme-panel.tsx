"use client"

import { useRef, useState, useTransition, type KeyboardEvent } from "react"

import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { setGallerySeasonalTheme } from "@/app/actions"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { nextRadioIndex } from "@/lib/gallery/radio-nav"
import {
  GALLERY_SEASONAL_THEME_IDS,
  GALLERY_SEASONAL_THEMES,
  type GallerySeasonalThemeId,
} from "@/lib/gallery/seasonal-themes"
import { describeSeasonalThemeToast } from "@/lib/gallery/seasonal-theme-toast"

type ThemeChoice = GallerySeasonalThemeId | "off"

const THEME_OPTIONS: Array<{
  value: ThemeChoice
  label: string
  hint?: string
}> = [
  {
    value: "off",
    label: "Paper wall",
    hint: "Default darkroom renewal",
  },
  ...GALLERY_SEASONAL_THEME_IDS.map((id) => ({
    value: id as ThemeChoice,
    label: GALLERY_SEASONAL_THEMES[id].label,
    hint: "Limited-time overlay",
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
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])

  const onSelect = (next: ThemeChoice) => {
    if (isPending || !settingsReady) return
    if (next === selected) return
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
      toast.success(describeSeasonalThemeToast(themeId))
    })
  }

  return (
    <section className={galleryPanelClass()}>
      <div className="space-y-1">
        <h2 className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}>
          Site theme
        </h2>
        <p className={gallerySectionLeadClass()}>
          Paper wall is the committed look. Seasonal themes add a light overlay
          — they never replace the darkroom renewal.
        </p>
      </div>

      <div
        className={cn(
          gallerySans(),
          "mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        )}
        role="radiogroup"
        aria-label="Seasonal site theme"
        aria-busy={isPending || undefined}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (isPending || !settingsReady) return
          const key = event.key
          if (
            key !== "ArrowLeft" &&
            key !== "ArrowRight" &&
            key !== "ArrowUp" &&
            key !== "ArrowDown" &&
            key !== "Home" &&
            key !== "End"
          ) {
            return
          }
          event.preventDefault()
          const current = Math.max(
            0,
            THEME_OPTIONS.findIndex((option) => option.value === selected)
          )
          const nextIndex = nextRadioIndex(current, THEME_OPTIONS.length, key)
          const next = THEME_OPTIONS[nextIndex]
          if (!next) return
          onSelect(next.value)
          queueMicrotask(() => optionRefs.current[nextIndex]?.focus())
        }}
      >
        {THEME_OPTIONS.map((option, index) => {
          const checked = selected === option.value
          const isDefault = option.value === "off"

          return (
            <button
              key={option.value}
              ref={(node) => {
                optionRefs.current[index] = node
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked ? 0 : -1}
              disabled={isPending || !settingsReady}
              aria-busy={isPending || undefined}
              onClick={() => onSelect(option.value)}
              className={cn(
                "min-w-[8.5rem] flex-1 rounded-xl border px-4 py-3 text-left transition-colors",
                "disabled:cursor-not-allowed disabled:opacity-50",
                checked
                  ? isDefault
                    ? "border-zinc-800/35 bg-zinc-900/[0.09] text-foreground ring-1 ring-zinc-900/10"
                    : "border-foreground/25 bg-foreground/[0.07] text-foreground"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:border-foreground/15 hover:bg-muted/40 hover:text-foreground"
              )}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              {option.hint ? (
                <span className="mt-0.5 block text-[11px] opacity-75">
                  {option.hint}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {!settingsReady ? (
        <p className={cn(gallerySans(), "mt-3 text-xs text-amber-800")}>
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
