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

import { renameGalleryImage } from "@/app/upload/actions"
import { ARTWORK_NAME_MAX } from "@/lib/gallery/upload-naming"

export function RenameButton({
  id,
  name,
  onRenamed,
}: {
  id: string
  name: string
  onRenamed?: (nextName: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(name)
  const [pending, startTransition] = useTransition()

  function openEditor(nextOpen: boolean) {
    if (nextOpen) setDraft(name)
    setOpen(nextOpen)
  }

  function onSave() {
    startTransition(async () => {
      const result = await renameGalleryImage(id, draft)
      if (result.ok) {
        const applied =
          result.names.find((patch) => patch.id === id)?.name ?? draft
        onRenamed?.(applied)
        toast.success("Name updated")
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
        aria-label={`Rename ${name}`}
        className="!text-lg text-muted-foreground italic hover:bg-transparent hover:text-foreground"
      >
        Rename
      </Button>
      <DialogContent className="gap-6">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl italic">
            Rename work
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label
            className="text-sm text-muted-foreground"
            htmlFor={`rename-name-${id}`}
          >
            Name
          </label>
          <Input
            id={`rename-name-${id}`}
            value={draft}
            maxLength={ARTWORK_NAME_MAX}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onSave()
              }
            }}
            disabled={pending}
            className="text-base"
            autoComplete="off"
          />
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
