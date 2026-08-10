"use client"

import {
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { useRouter } from "next/navigation"
import { IconPlus, IconTag, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { attachGalleryTag, detachGalleryTag } from "@/app/actions/tags"
import {
  galleryFilterChipClass,
  gallerySans,
} from "@/components/gallery-chrome"
import {
  buildGalleryHomeHref,
  EMPTY_GALLERY_HOME_FILTERS,
} from "@/lib/gallery/home-filters"
import {
  GALLERY_TAGS_PER_IMAGE_MAX,
  normalizeGalleryTagName,
  normalizeGalleryTagSlug,
  type GalleryTag,
} from "@/lib/gallery/tags"
import { cn } from "@workspace/ui/lib/utils"

export function GalleryImageTags({
  imageId,
  tags: initialTags,
  canEdit,
}: {
  imageId: string
  tags: GalleryTag[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [tags, setTags] = useState(initialTags)
  const [draft, setDraft] = useState("")
  const [isPending, startTransition] = useTransition()

  const applyTagFilter = (slug: string) => {
    try {
      router.push(
        buildGalleryHomeHref({
          filters: { ...EMPTY_GALLERY_HOME_FILTERS, tagSlug: slug },
        })
      )
    } catch {
      toast.error("Could not open the tag filter.")
    }
  }

  const onAdd = (event?: FormEvent) => {
    event?.preventDefault()
    const name = normalizeGalleryTagName(draft)
    if (isPending) return
    if (!name) return
    const slug = normalizeGalleryTagSlug(name)
    if (!slug) return
    if (tags.length >= GALLERY_TAGS_PER_IMAGE_MAX) {
      toast.error(`At most ${GALLERY_TAGS_PER_IMAGE_MAX} tags per photo.`)
      return
    }
    if (tags.some((tag) => tag.slug === slug)) {
      setDraft("")
      return
    }

    startTransition(async () => {
      const result = await attachGalleryTag(imageId, name)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setTags((prev) => {
        if (prev.some((tag) => tag.id === result.data.id)) return prev
        return [...prev, result.data].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      })
      setDraft("")
    })
  }

  const onRemove = (tag: GalleryTag) => {
    if (isPending) return
    startTransition(async () => {
      const result = await detachGalleryTag(imageId, tag.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setTags((prev) => prev.filter((item) => item.id !== tag.id))
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      onAdd()
    }
  }

  if (!canEdit && tags.length === 0) return null

  return (
    <div
      aria-busy={isPending || undefined}
      className={cn(gallerySans(), "space-y-2")}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex max-w-full items-center gap-0.5 rounded-[2px] border border-zinc-800/15 bg-zinc-900/[0.04]"
          >
            <button
              type="button"
              onClick={() => applyTagFilter(tag.slug)}
              className={cn(
                galleryFilterChipClass(false),
                "border-0 bg-transparent shadow-none"
              )}
              title={`Show #${tag.slug} on the wall`}
            >
              <IconTag className="size-3 opacity-70" aria-hidden />
              <span className="max-w-[9rem] truncate">{tag.name}</span>
            </button>
            {canEdit ? (
              <button
                type="button"
                aria-label={`Remove tag ${tag.name}`}
                disabled={isPending}
                aria-busy={isPending || undefined}
                onClick={() => onRemove(tag)}
                className="mr-1 inline-flex size-5 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-900/10 hover:text-foreground disabled:opacity-50"
              >
                <IconX className="size-3" aria-hidden />
              </button>
            ) : null}
          </span>
        ))}
      </div>
      {canEdit ? (
        <form
          onSubmit={onAdd}
          aria-busy={isPending || undefined}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={40}
            placeholder="Add a tag…"
            disabled={isPending || tags.length >= GALLERY_TAGS_PER_IMAGE_MAX}
            className="min-h-8 min-w-0 flex-1 rounded-[2px] border border-zinc-800/18 bg-white/90 px-2.5 text-xs outline-none placeholder:text-zinc-400 focus:border-zinc-800/35"
          />
          <button
            type="submit"
            disabled={
              isPending ||
              !draft.trim() ||
              tags.length >= GALLERY_TAGS_PER_IMAGE_MAX
            }
            aria-busy={isPending || undefined}
            className={cn(
              galleryFilterChipClass(false),
              "inline-flex items-center gap-1 disabled:opacity-50"
            )}
            aria-label="Add tag"
          >
            <IconPlus className="size-3.5" aria-hidden />
            Tag
          </button>
        </form>
      ) : null}
    </div>
  )
}
