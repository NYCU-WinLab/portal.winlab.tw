"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"

import { deleteGalleryImage } from "@/app/upload/actions"

export function DeleteButton({
  id,
  imagePath,
  posterPath,
  name,
}: {
  id: string
  imagePath: string
  posterPath?: string | null
  name: string
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      queueMicrotask(() => triggerRef.current?.focus())
    }
  }

  function onConfirm() {
    if (pending) return
    startTransition(async () => {
      const result = await deleteGalleryImage(id, imagePath, posterPath)
      if (result.ok) {
        if (result.warning) {
          toast.warning(`Deleted "${name}"`, {
            description: result.warning,
          })
        } else {
          toast.success(`Deleted "${name}"`)
        }
        setOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          ref={triggerRef}
          variant="ghost"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Delete ${name}`}
          className="!text-lg text-muted-foreground italic hover:bg-transparent hover:text-foreground"
        >
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the work from the gallery and the storage bucket.
            Cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
