"use client"

import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  IconChevronDown,
  IconFilter,
  IconBookmark,
  IconSearch,
  IconTag,
  IconX,
} from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import {
  galleryFilterChipClass,
  gallerySans,
  gallerySerif,
} from "@/components/gallery-chrome"
import {
  buildGalleryHomeHref,
  describeGalleryFilterSummary,
  hasActiveGalleryFilters,
  type GalleryHomeFilters,
  type GalleryMediaFilter,
} from "@/lib/gallery/home-filters"
import type { GalleryMember } from "@/lib/gallery/types"
import type { GalleryTagSuggestion } from "@/lib/gallery/tags"

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
      className="mx-0.5 hidden h-4 w-px shrink-0 bg-zinc-900/12 sm:mx-1.5 sm:block"
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
      className={cn(galleryFilterChipClass(active), disabled && "opacity-50")}
    >
      {children}
    </button>
  )
}

export function GalleryHomeFiltersBar({
  filters,
  members,
  popularTags = [],
}: {
  filters: GalleryHomeFilters
  members: GalleryMember[]
  popularTags?: GalleryTagSuggestion[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [searchDraft, setSearchDraft] = useState(filters.query ?? "")
  const [tagDraft, setTagDraft] = useState("")
  const [prevQuery, setPrevQuery] = useState(filters.query)

  if (filters.query !== prevQuery) {
    setPrevQuery(filters.query)
    setSearchDraft(filters.query ?? "")
  }

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

  const activeTag = useMemo(() => {
    if (!filters.tagSlug) return null
    return (
      popularTags.find((tag) => tag.slug === filters.tagSlug) ?? {
        id: filters.tagSlug,
        name: filters.tagSlug,
        slug: filters.tagSlug,
        use_count: 0,
      }
    )
  }, [filters.tagSlug, popularTags])

  const datePreset = datePresetFromAfter(filters.uploadedAfter)
  const active = hasActiveGalleryFilters(filters)
  const summaryParts = useMemo(
    () =>
      describeGalleryFilterSummary(filters, members, activeTag?.name ?? null),
    [activeTag?.name, filters, members]
  )

  const uploaderLabel = useMemo(() => {
    if (!filters.uploaderId) return "Anyone"
    const member = members.find((item) => item.id === filters.uploaderId)
    return member?.name ?? member?.email ?? "Member"
  }, [filters.uploaderId, members])

  const mobileFilterLabel = useMemo(() => {
    if (!active) return "Filters"
    const bits: string[] = []
    if (filters.savedOnly) bits.push("Saved")
    if (filters.tagSlug) bits.push(`#${filters.tagSlug}`)
    if (filters.media !== "all") {
      bits.push(
        MEDIA_OPTIONS.find((o) => o.value === filters.media)?.label ?? "Media"
      )
    }
    if (datePreset !== "all") {
      bits.push(
        DATE_OPTIONS.find((o) => o.value === datePreset)?.label ?? "When"
      )
    }
    if (filters.uploaderId) bits.push(uploaderLabel)
    return bits.slice(0, 2).join(" · ") || "Filters"
  }, [
    active,
    datePreset,
    filters.media,
    filters.savedOnly,
    filters.tagSlug,
    filters.uploaderId,
    uploaderLabel,
  ])

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    apply({
      ...filters,
      query: searchDraft.trim() || null,
    })
  }

  const applyTagDraft = () => {
    const slug = tagDraft.trim().toLowerCase().replace(/\s+/g, "-")
    if (!slug) {
      apply({ ...filters, tagSlug: null })
      return
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return
    setTagDraft("")
    apply({ ...filters, tagSlug: slug })
  }

  const clearAll = () => {
    setSearchDraft("")
    setTagDraft("")
    apply({
      uploaderId: null,
      media: "all",
      uploadedAfter: null,
      query: null,
      tagSlug: null,
      savedOnly: false,
    })
  }

  return (
    <nav
      aria-label="Filter gallery"
      className={cn(
        gallerySans(),
        "gallery-home-filters mb-8 flex flex-col items-center sm:mb-10"
      )}
    >
      <div className="gallery-home-filters-sheet">
        <div className="gallery-home-filters-sheet-rail" aria-hidden />
        <div className="relative flex flex-col items-center gap-3 px-4 pt-4 pb-4 sm:gap-3.5 sm:px-6 sm:pt-5 sm:pb-5">
          <div className="flex flex-col items-center gap-1 text-center">
            <p
              className={cn(
                gallerySans(),
                "text-[10px] tracking-[0.22em] text-zinc-500 uppercase"
              )}
            >
              Contact sheet
            </p>
            <p
              className={cn(
                gallerySerif(),
                "text-xl leading-none tracking-tight text-foreground sm:text-2xl"
              )}
            >
              Find on the wall
            </p>
          </div>

          <form
            onSubmit={onSearchSubmit}
            className="flex w-full max-w-md items-center gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <IconSearch
                className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-500"
                aria-hidden
              />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search titles & tags…"
                className={cn(
                  gallerySans(),
                  "gallery-home-filters-search min-h-10 w-full rounded-[2px] border border-zinc-800/18 bg-white/90 py-2.5 pr-9 pl-9 text-xs text-foreground shadow-[inset_0_1px_2px_rgba(24,24,27,0.04)] transition-[border-color,box-shadow] outline-none placeholder:text-zinc-400 focus:border-zinc-800/35 focus:shadow-[0_0_0_3px_rgba(24,24,27,0.06)]"
                )}
              />
              {searchDraft ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-zinc-500 hover:text-foreground"
                  onClick={() => {
                    setSearchDraft("")
                    apply({ ...filters, query: null })
                  }}
                >
                  <IconX className="size-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={isPending}
              className={cn(
                galleryFilterChipClass(false),
                "shrink-0 border-zinc-800/25 bg-zinc-900/[0.06] font-medium text-foreground",
                isPending && "opacity-50"
              )}
            >
              Search
            </button>
          </form>

          {/* Mobile: one Filters menu (media + when + who) */}
          <div className="flex w-full max-w-md items-center justify-center gap-2 sm:hidden">
            <FilterPill
              active={filters.savedOnly}
              disabled={isPending}
              onClick={() =>
                apply({ ...filters, savedOnly: !filters.savedOnly })
              }
            >
              <span className="inline-flex items-center gap-1">
                <IconBookmark className="size-3 opacity-80" aria-hidden />
                Saved
              </span>
            </FilterPill>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isPending}
                  className={cn(
                    galleryFilterChipClass(active),
                    "inline-flex max-w-[16rem] items-center gap-1.5",
                    isPending && "opacity-50"
                  )}
                >
                  <IconFilter
                    className="size-3.5 shrink-0 opacity-80"
                    aria-hidden
                  />
                  <span className="truncate">{mobileFilterLabel}</span>
                  <IconChevronDown className="size-3 shrink-0 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                className={cn(
                  gallerySans(),
                  "max-h-[70dvh] w-56 overflow-y-auto"
                )}
              >
                <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
                  Tag
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer text-xs"
                  onClick={() => apply({ ...filters, tagSlug: null })}
                >
                  Any tag
                </DropdownMenuItem>
                {popularTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    className="cursor-pointer text-xs"
                    onClick={() =>
                      apply({
                        ...filters,
                        tagSlug: tag.slug,
                      })
                    }
                  >
                    <span className="truncate">
                      #{tag.slug}
                      {tag.use_count > 0 ? ` · ${tag.use_count}` : ""}
                    </span>
                    {filters.tagSlug === tag.slug ? " ·" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
                  Media
                </DropdownMenuLabel>
                {MEDIA_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer text-xs"
                    onClick={() => apply({ ...filters, media: option.value })}
                  >
                    {option.label}
                    {filters.media === option.value ? " ·" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
                  When
                </DropdownMenuLabel>
                {DATE_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className="cursor-pointer text-xs"
                    onClick={() =>
                      apply({
                        ...filters,
                        uploadedAfter: dateAfterFromPreset(option.value),
                      })
                    }
                  >
                    {option.label}
                    {datePreset === option.value ? " ·" : ""}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] tracking-wide uppercase">
                  Who
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="cursor-pointer text-xs"
                  onClick={() => apply({ ...filters, uploaderId: null })}
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
                {active ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-xs"
                      onClick={clearAll}
                    >
                      Clear filters
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
            {active ? (
              <button
                type="button"
                disabled={isPending}
                onClick={clearAll}
                className={cn(
                  galleryFilterChipClass(false),
                  "inline-flex items-center gap-1",
                  isPending && "opacity-50"
                )}
                aria-label="Clear filters"
              >
                <IconX className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* Desktop: expanded pill row */}
          <div className="hidden flex-wrap items-center justify-center gap-1.5 sm:flex">
            <FilterPill
              active={filters.savedOnly}
              disabled={isPending}
              onClick={() =>
                apply({ ...filters, savedOnly: !filters.savedOnly })
              }
            >
              <span className="inline-flex items-center gap-1">
                <IconBookmark className="size-3 opacity-80" aria-hidden />
                Saved
              </span>
            </FilterPill>

            <FilterDivider />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={isPending}
                  className={cn(
                    galleryFilterChipClass(filters.tagSlug !== null),
                    "inline-flex items-center gap-1",
                    isPending && "opacity-50"
                  )}
                >
                  <IconTag className="size-3 opacity-70" aria-hidden />
                  <span className="max-w-[10rem] truncate">
                    {activeTag ? `#${activeTag.slug}` : "Any tag"}
                  </span>
                  <IconChevronDown className="size-3 shrink-0 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                className={cn(gallerySans(), "max-h-72 w-56 overflow-y-auto")}
              >
                <DropdownMenuItem
                  className="cursor-pointer text-xs"
                  onClick={() => apply({ ...filters, tagSlug: null })}
                >
                  Any tag
                </DropdownMenuItem>
                {popularTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    className="cursor-pointer text-xs"
                    onClick={() =>
                      apply({
                        ...filters,
                        tagSlug: tag.slug,
                      })
                    }
                  >
                    <span className="truncate">
                      {tag.name}
                      {tag.use_count > 0 ? ` · ${tag.use_count}` : ""}
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        applyTagDraft()
                      }
                    }}
                    placeholder="slug…"
                    className="min-h-7 min-w-0 flex-1 rounded-[2px] border border-zinc-800/15 bg-white px-2 text-xs outline-none"
                  />
                  <button
                    type="button"
                    className="text-[11px] font-medium text-foreground"
                    onClick={applyTagDraft}
                  >
                    Go
                  </button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <FilterDivider />

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
                    galleryFilterChipClass(filters.uploaderId !== null),
                    "inline-flex items-center gap-1",
                    isPending && "opacity-50"
                  )}
                >
                  <span className="max-w-[10rem] truncate">
                    {uploaderLabel}
                  </span>
                  <IconChevronDown className="size-3 shrink-0 opacity-70" />
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
                  onClick={clearAll}
                  className={cn(
                    galleryFilterChipClass(false),
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
                "inline-flex max-w-md items-center rounded-[2px] border border-zinc-800/10 bg-zinc-900/[0.04] px-3 py-1 text-[11px] text-zinc-600"
              )}
            >
              Showing {summaryParts.join(" · ")}
            </p>
          ) : (
            <p className={cn(gallerySans(), "text-[11px] text-zinc-500/90")}>
              Media · when · who · tags
            </p>
          )}
        </div>
      </div>
    </nav>
  )
}
