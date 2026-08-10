"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { IconCheck, IconPencil, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { renameGalleryImage } from "@/app/upload/actions"
import { gallerySans, gallerySerif } from "@/components/gallery-chrome"
import {
  describeArtworkTitleUpdated,
  describeEditTitleAriaLabel,
  describeEditTitleNamedAriaLabel,
} from "@/lib/gallery/manage-toast"
import { describeSavingLabel } from "@/lib/gallery/busy-labels"
import { describeSaveLabel } from "@/lib/gallery/dialog-action-labels"
import type { ArtworkNamePatch } from "@/lib/gallery/rename-artwork"
import { ARTWORK_NAME_MAX } from "@/lib/gallery/upload-naming"

type GalleryTitleEditorProps = {
  imageId: string
  name: string
  /** When false, renders a read-only title (non-owners / signed-out). */
  canEdit: boolean
  /** Compact polaroid caption; default is lightbox aside heading. */
  variant?: "lightbox" | "polaroid"
  className?: string
  onRenamed?: (patches: ArtworkNamePatch[]) => void
}

export function GalleryTitleEditor({
  imageId,
  name,
  canEdit,
  variant = "lightbox",
  className,
  onRenamed,
}: GalleryTitleEditorProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const editTriggerRef = useRef<HTMLButtonElement>(null)
  const focusRestoreRef = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!editing) return
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [editing])

  function endEditing() {
    setEditing(false)
    const trigger = focusRestoreRef.current ?? editTriggerRef.current
    focusRestoreRef.current = null
    queueMicrotask(() => trigger?.focus())
  }

  function beginEdit(trigger?: HTMLButtonElement | null) {
    focusRestoreRef.current = trigger ?? editTriggerRef.current
    setDraft(name)
    setEditing(true)
  }

  function cancel() {
    setDraft(name)
    endEditing()
  }

  function save() {
    if (pending) return
    startTransition(async () => {
      const result = await renameGalleryImage(imageId, draft)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onRenamed?.(result.names)
      toast.success(describeArtworkTitleUpdated())
      endEditing()
    })
  }

  if (!canEdit) {
    return (
      <h2
        title={name}
        className={cn(
          titleClass(variant),
          variant === "polaroid" && "truncate text-center",
          className
        )}
      >
        {name}
      </h2>
    )
  }

  if (editing) {
    return (
      <div
        className={cn(
          "gallery-title-editor flex min-w-0 flex-col gap-2",
          className
        )}
        aria-busy={pending || undefined}
      >
        <label htmlFor={inputId} className="sr-only">
          Title
        </label>
        <input
          ref={inputRef}
          id={inputId}
          value={draft}
          maxLength={ARTWORK_NAME_MAX}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.stopPropagation()
              save()
            }
            if (event.key === "Escape") {
              event.preventDefault()
              event.stopPropagation()
              cancel()
            }
          }}
          className={cn(
            gallerySerif(),
            "w-full min-w-0 rounded-[2px] border border-zinc-800/25 bg-white px-2.5 py-1.5 text-foreground shadow-[inset_0_1px_2px_rgba(24,24,27,0.04)] outline-none",
            "focus-visible:border-zinc-800/45 focus-visible:ring-2 focus-visible:ring-zinc-800/10",
            variant === "lightbox"
              ? "text-2xl leading-none tracking-tight sm:text-[1.75rem]"
              : "text-center text-[0.95rem] leading-snug sm:text-base"
          )}
          autoComplete="off"
          spellCheck={false}
          aria-busy={pending || undefined}
        />
        <div
          className={cn(
            gallerySans(),
            "flex flex-wrap items-center gap-2",
            variant === "polaroid" && "justify-center"
          )}
        >
          <button
            type="button"
            onClick={save}
            disabled={pending}
            aria-busy={pending || undefined}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <IconCheck className="size-3.5" aria-hidden />
            {pending ? describeSavingLabel() : describeSaveLabel()}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-900/[0.06] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-zinc-900/10 hover:text-foreground disabled:opacity-60"
          >
            <IconX className="size-3.5" aria-hidden />
            Cancel
          </button>
          <span className="text-[10px] tracking-wide text-muted-foreground/70">
            Enter · Esc
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "gallery-title-editor group flex min-w-0 items-center gap-1.5",
        variant === "polaroid" && "justify-center",
        className
      )}
    >
      <button
        ref={editTriggerRef}
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          beginEdit(event.currentTarget)
        }}
        className={cn(
          titleClass(variant),
          "min-w-0 rounded-[2px] text-left transition-colors hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-zinc-800/15 focus-visible:outline-none",
          variant === "polaroid" && "truncate text-center"
        )}
        aria-label={describeEditTitleNamedAriaLabel(name)}
        title={variant === "polaroid" ? name : describeEditTitleAriaLabel()}
      >
        {name}
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          beginEdit(event.currentTarget)
        }}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
          "hover:bg-zinc-900/10 hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-zinc-800/15 focus-visible:outline-none",
          "opacity-70 group-hover:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        )}
        aria-label={describeEditTitleAriaLabel()}
      >
        <IconPencil className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

function titleClass(variant: "lightbox" | "polaroid") {
  return cn(
    gallerySerif(),
    variant === "lightbox"
      ? "text-2xl leading-none tracking-tight text-foreground sm:text-[1.75rem]"
      : "text-[0.95rem] leading-snug text-foreground/90 sm:text-base"
  )
}
