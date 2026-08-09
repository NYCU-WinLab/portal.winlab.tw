"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

import { updateGalleryImageTakenAt } from "@/app/upload/actions"
import { gallerySans } from "@/components/gallery-chrome"
import { galleryTaipeiCalendarDay } from "@/lib/gallery/memories"

function toTaipeiDateInput(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const day = galleryTaipeiCalendarDay(date)
  const month = String(day.month).padStart(2, "0")
  const datePart = String(day.day).padStart(2, "0")
  return `${day.year}-${month}-${datePart}`
}

function fromTaipeiDateInput(value: string): string {
  // Noon Taipei so Memories calendar day matches the date picker.
  return `${value.trim()}T12:00:00+08:00`
}

export function TakenAtEditor({
  id,
  takenAt,
  createdAt,
  imageName,
  hintUploadDay = false,
  onUpdated,
}: {
  id: string
  takenAt: string | null | undefined
  createdAt: string
  imageName?: string
  hintUploadDay?: boolean
  onUpdated?: (nextTakenAt: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(() =>
    toTaipeiDateInput(takenAt ?? createdAt)
  )
  const [pending, startTransition] = useTransition()

  function openEditor(nextOpen: boolean) {
    if (nextOpen) setDraft(toTaipeiDateInput(takenAt ?? createdAt))
    setOpen(nextOpen)
  }

  function onSave() {
    if (!draft.trim()) {
      toast.error("Pick a capture date.")
      return
    }
    startTransition(async () => {
      const result = await updateGalleryImageTakenAt(
        id,
        fromTaipeiDateInput(draft)
      )
      if (result.ok) {
        onUpdated?.(result.takenAt)
        toast.success("Capture date updated")
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={openEditor}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => openEditor(true)}
        aria-label={
          imageName
            ? `Edit capture date for ${imageName}`
            : "Edit capture date for this work"
        }
        className={cn(
          gallerySans(),
          "!text-lg text-muted-foreground italic hover:bg-transparent hover:text-foreground"
        )}
      >
        Date
      </Button>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl italic">
            Capture date
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label
            className={cn(gallerySans(), "text-sm text-muted-foreground")}
            htmlFor={`taken-at-date-${id}`}
          >
            When was this shot taken? (Asia/Taipei day for Memories)
          </label>
          <Input
            id={`taken-at-date-${id}`}
            type="date"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={pending}
            className="text-base"
          />
          {hintUploadDay ? (
            <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
              Looks like upload day (no EXIF). Fix it so On this day can find
              the shot next year.
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => openEditor(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={pending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
