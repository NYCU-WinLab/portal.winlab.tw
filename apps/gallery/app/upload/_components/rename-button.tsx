"use client"

import { useEffect, useState, useTransition } from "react"
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

export function RenameButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(name)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (open) setDraft(name)
  }, [open, name])

  function onSave() {
    startTransition(async () => {
      const result = await renameGalleryImage(id, draft)
      if (result.ok) {
        toast.success("Name updated")
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
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
            htmlFor="rename-name"
          >
            Name
          </label>
          <Input
            id="rename-name"
            value={draft}
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
            onClick={() => setOpen(false)}
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
