"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { IconGitMerge, IconPencil } from "@tabler/icons-react"
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
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import {
  adminMergeGalleryTags,
  adminRenameGalleryTag,
  listPopularGalleryTags,
} from "@/app/actions/tags"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import {
  GALLERY_TAG_NAME_MAX,
  normalizeGalleryTagName,
  type GalleryTagSuggestion,
} from "@/lib/gallery/tags"

export function TagAdminPanel() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tags, setTags] = useState<GalleryTagSuggestion[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState("")
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string>("")
  const dialogTriggerRef = useRef<HTMLElement | null>(null)

  const refresh = () => {
    startTransition(async () => {
      const result = await listPopularGalleryTags(100)
      if (!result.ok) {
        setLoadError(result.error)
        setLoaded(true)
        setTags([])
        toast.error(result.error)
        return
      }
      setLoadError(null)
      setTags(result.data)
      setLoaded(true)
    })
  }

  useEffect(() => {
    refresh()
    // Mount-only load of the popular tag catalog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renameTarget = useMemo(
    () => tags.find((tag) => tag.id === renameId) ?? null,
    [tags, renameId]
  )
  const mergeSource = useMemo(
    () => tags.find((tag) => tag.id === mergeSourceId) ?? null,
    [tags, mergeSourceId]
  )
  const mergeTargets = useMemo(
    () => tags.filter((tag) => tag.id !== mergeSourceId),
    [tags, mergeSourceId]
  )

  const openRename = (
    tag: GalleryTagSuggestion,
    trigger?: HTMLElement | null
  ) => {
    dialogTriggerRef.current = trigger ?? null
    setRenameId(tag.id)
    setRenameDraft(tag.name)
  }

  const restoreDialogFocus = () => {
    const trigger = dialogTriggerRef.current
    dialogTriggerRef.current = null
    queueMicrotask(() => trigger?.focus())
  }

  const submitRename = () => {
    if (!renameId || pending) return
    const name = normalizeGalleryTagName(renameDraft)
    if (!name) {
      toast.error("Give the tag a usable name.")
      return
    }
    startTransition(async () => {
      const result = await adminRenameGalleryTag(renameId, name)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Renamed to "${result.data.name}"`)
      setRenameId(null)
      setRenameDraft("")
      refresh()
      router.refresh()
    })
  }

  const openMerge = (
    tag: GalleryTagSuggestion,
    trigger?: HTMLElement | null
  ) => {
    dialogTriggerRef.current = trigger ?? null
    setMergeSourceId(tag.id)
    setMergeTargetId("")
  }

  const submitMerge = () => {
    if (pending) return
    if (!mergeSourceId || !mergeTargetId) {
      toast.error("Pick a target tag to merge into.")
      return
    }
    startTransition(async () => {
      const result = await adminMergeGalleryTags(mergeSourceId, mergeTargetId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        `Merged into "${result.data.name}" (${result.data.moved_count} link${result.data.moved_count === 1 ? "" : "s"} moved)`
      )
      setMergeSourceId(null)
      setMergeTargetId("")
      refresh()
      router.refresh()
    })
  }

  return (
    <section
      className={cn(galleryPanelClass(), "space-y-5")}
      aria-busy={pending || undefined}
    >
      <div className="space-y-1">
        <p
          className={cn(
            gallerySans(),
            "text-[10px] tracking-[0.22em] text-muted-foreground uppercase"
          )}
        >
          Admin
        </p>
        <h2 className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}>
          Tag catalog
        </h2>
        <p className={gallerySectionLeadClass()}>
          Rename a label or merge duplicates. Members still create tags by
          typing them on photos — this is cleanup only.
        </p>
      </div>

      {!loaded && pending ? (
        <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
          Loading tags…
        </p>
      ) : loadError ? (
        <div className="space-y-3">
          <p
            role="status"
            aria-live="polite"
            className={cn(gallerySans(), "text-sm text-amber-800")}
          >
            Could not load the tag catalog — {loadError}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={refresh}
            className={gallerySans()}
          >
            Retry
          </Button>
        </div>
      ) : tags.length === 0 ? (
        <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
          No tags yet — hang a few photos and label them first.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-md border border-border/60">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:flex-nowrap"
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    gallerySans(),
                    "truncate text-sm text-foreground"
                  )}
                >
                  {tag.name}
                </p>
                <p
                  className={cn(
                    gallerySans(),
                    "truncate text-[11px] text-muted-foreground"
                  )}
                >
                  #{tag.slug}
                  <span aria-hidden> · </span>
                  {tag.use_count} use{tag.use_count === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={(event) => openRename(tag, event.currentTarget)}
                >
                  <IconPencil className="size-3.5" aria-hidden />
                  Rename
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending || tags.length < 2}
                  onClick={(event) => openMerge(tag, event.currentTarget)}
                >
                  <IconGitMerge className="size-3.5" aria-hidden />
                  Merge
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setRenameId(null)
            setRenameDraft("")
            restoreDialogFocus()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Rename &ldquo;{renameTarget?.name ?? "tag"}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The slug updates with the name. Existing photo links stay put —
              only the label text changes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="tag-rename-name" className={gallerySans()}>
              New name
            </Label>
            <Input
              id="tag-rename-name"
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              maxLength={GALLERY_TAG_NAME_MAX}
              disabled={pending}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitRename}
              disabled={pending}
              aria-busy={pending || undefined}
            >
              {pending ? "Saving…" : "Save name"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(mergeSource)}
        onOpenChange={(open) => {
          if (!open) {
            setMergeSourceId(null)
            setMergeTargetId("")
            restoreDialogFocus()
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Merge &ldquo;{mergeSource?.name ?? "tag"}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Photo links move onto the target tag. The source label is deleted.
              Overlapping links on the same photo are deduped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="tag-merge-target" className={gallerySans()}>
              Merge into
            </Label>
            <select
              id="tag-merge-target"
              value={mergeTargetId}
              onChange={(event) => setMergeTargetId(event.target.value)}
              disabled={pending}
              className={cn(
                gallerySans(),
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              )}
            >
              <option value="">Choose a tag…</option>
              {mergeTargets.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name} (#{tag.slug})
                </option>
              ))}
            </select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitMerge}
              disabled={pending || !mergeTargetId}
              aria-busy={pending || undefined}
            >
              {pending ? "Merging…" : "Merge tags"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
