"use client"

import { useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { IconChevronDown, IconSearch, IconX } from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import { galleryNavLinkClass, gallerySans } from "@/components/gallery-chrome"
import {
  buildGalleryHomeHref,
  describeGalleryFilterSummary,
  hasActiveGalleryFilters,
  type GalleryHomeFilters,
  type GalleryMediaFilter,
} from "@/lib/gallery/home-filters"
import type { GalleryMember } from "@/lib/gallery/types"

const MEDIA_OPTIONS: { value: GalleryMediaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "image", label: "Photos" },
  { value: "video", label: "Videos" },
]

const DATE_OPTIONS = [
  { value: "all", label: "Any time" },
  { value: "7d", label: "Week" },
  { value: "30d", label: "Month" },
  { value: "365d", label: "Year" },
] as const

function dateAfterFromPreset(preset: string): string | null {
  const days =
    preset === "7d" ? 7 : preset === "30d" ? 30 : preset === "365d" ? 365 : 0
  if (!days) return null
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

function datePresetFromAfter(after: string | null): string {
  if (!after) return "all"
  const target = new Date(after).getTime()
  if (!Number.isFinite(target)) return "all"
  for (const preset of ["7d", "30d", "365d"] as const) {
    const iso = dateAfterFromPreset(preset)
    if (!iso) continue
    const diff = Math.abs(new Date(iso).getTime() - target)
    if (diff < 60_000) return preset
  }
  return "custom"
}

function FilterDivider() {
  return (
    <span
      aria-hidden
      className="mx-0.5 hidden h-3 w-px shrink-0 bg-border/70 sm:mx-1 sm:block"
    />
  )
}

function FilterPill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(galleryNavLinkClass(active), disabled && "opacity-50")}
    >
      {children}
    </button>
  )
}

export function GalleryHomeFiltersBar({
  filters,
  members,
}: {
  filters: GalleryHomeFilters
  members: GalleryMember[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.query ?? "")

  const apply = (next: GalleryHomeFilters) => {
    const photo = searchParams.get("photo")
    const comment = searchParams.get("comment")
    const href = buildGalleryHomeHref({
      filters: next,
      photoId: photo,
      commentId: comment,
    })
    startTransition(() => {
      router.replace(href, { scroll: false })
    })
  }

  const datePreset = datePresetFromAfter(filters.uploadedAfter)
  const active = hasActiveGalleryFilters(filters)
  const summaryParts = useMemo(
    () => describeGalleryFilterSummary(filters, members),
    [filters, members]
  )

  const uploaderLabel = useMemo(() => {
    if (!filters.uploaderId) return "Anyone"
    const member = members.find((item) => item.id === filters.uploaderId)
    return member?.name ?? member?.email ?? "Member"
  }, [filters.uploaderId, members])

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    apply({
      ...filters,
      query: searchDraft.trim() || null,
    })
  }

  return (
    <nav
      aria-label="Filter gallery"
      className={cn(
        gallerySans(),
        "gallery-home-filters mb-9 flex flex-col items-center gap-3 sm:mb-10"
      )}
    >
      <form
        onSubmit={onSearchSubmit}
        className="flex w-full max-w-md items-center gap-2 px-2"
      >
        <div className="relative min-w-0 flex-1">
          <IconSearch
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Search titles…"
            className={cn(
              gallerySans(),
              "w-full rounded-full border border-border/60 bg-background/80 py-2 pr-3 pl-9 text-xs text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/20"
            )}
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={cn(galleryNavLinkClass(), isPending && "opacity-50")}
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {MEDIA_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            active={filters.media === option.value}
            disabled={isPending}
            onClick={() =>
              apply({
                ...filters,
                media: option.value,
              })
            }
          >
            {option.label}
          </FilterPill>
        ))}

        <FilterDivider />

        {DATE_OPTIONS.map((option) => (
          <FilterPill
            key={option.value}
            active={datePreset === option.value}
            disabled={isPending}
            onClick={() =>
              apply({
                ...filters,
                uploadedAfter: dateAfterFromPreset(option.value),
              })
            }
          >
            {option.label}
          </FilterPill>
        ))}

        <FilterDivider />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={isPending}
              className={cn(
                galleryNavLinkClass(filters.uploaderId !== null),
                "inline-flex items-center gap-1",
                isPending && "opacity-50"
              )}
            >
              <span className="max-w-[8rem] truncate sm:max-w-[10rem]">
                {uploaderLabel}
              </span>
              <IconChevronDown className="size-3 shrink-0 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="center"
            className={cn(gallerySans(), "max-h-64 w-48 overflow-y-auto")}
          >
            <DropdownMenuItem
              className="cursor-pointer text-xs"
              onClick={() =>
                apply({
                  ...filters,
                  uploaderId: null,
                })
              }
            >
              Anyone
            </DropdownMenuItem>
            {members.map((member) => (
              <DropdownMenuItem
                key={member.id}
                className="cursor-pointer text-xs"
                onClick={() =>
                  apply({
                    ...filters,
                    uploaderId: member.id,
                  })
                }
              >
                <span className="truncate">
                  {member.name ?? member.email ?? "Member"}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {active ? (
          <>
            <FilterDivider />
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setSearchDraft("")
                apply({
                  uploaderId: null,
                  media: "all",
                  uploadedAfter: null,
                  query: null,
                })
              }}
              className={cn(
                galleryNavLinkClass(),
                "inline-flex items-center gap-1",
                isPending && "opacity-50"
              )}
            >
              <IconX className="size-3" aria-hidden />
              Clear
            </button>
          </>
        ) : null}
      </div>

      {summaryParts.length > 0 ? (
        <p
          className={cn(
            gallerySans(),
            "rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground shadow-sm"
          )}
        >
          {summaryParts.join(" · ")}
        </p>
      ) : null}
    </nav>
  )
}
