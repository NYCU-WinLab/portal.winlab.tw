"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { createGalleryAlbum } from "@/app/actions/albums"
import {
  gallerySans,
  gallerySectionLeadClass,
} from "@/components/gallery-chrome"
import {
  GALLERY_ALBUM_DESCRIPTION_MAX,
  GALLERY_ALBUM_TITLE_MAX,
  normalizeGalleryAlbumTitle,
} from "@/lib/gallery/albums"

export function GalleryAlbumCreateForm({ className }: { className?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [pending, startTransition] = useTransition()

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    const normalized = normalizeGalleryAlbumTitle(title)
    if (!normalized) {
      toast.error("Give the album a name with letters or numbers.")
      return
    }

    startTransition(async () => {
      const result = await createGalleryAlbum({
        title: normalized,
        description: description.trim() || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Album “${result.data.title}” is ready`)
      setTitle("")
      setDescription("")
      router.push(`/albums/${result.data.slug}`)
      router.refresh()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      className={cn("space-y-4", className)}
      aria-label="Create album"
    >
      <div className="space-y-2">
        <Label htmlFor="album-title" className={gallerySans()}>
          Title
        </Label>
        <Input
          id="album-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={GALLERY_ALBUM_TITLE_MAX}
          placeholder="Lab retreat, demo day…"
          disabled={pending}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="album-description" className={gallerySans()}>
          Description{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="album-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={GALLERY_ALBUM_DESCRIPTION_MAX}
          placeholder="A short note for anyone opening the share link."
          disabled={pending}
          rows={3}
        />
        <p className={cn(gallerySectionLeadClass(), "text-xs")}>
          Shareable URL becomes{" "}
          <span className="text-foreground">/albums/&lt;slug&gt;</span> from the
          title.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create album"}
      </Button>
    </form>
  )
}
