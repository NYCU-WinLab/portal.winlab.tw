"use client"

import { useRef, useState, useTransition } from "react"

import { IconAlertTriangle, IconRefresh, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  adminDeleteBrokenGalleryImages,
  scanGalleryMediaHealthPage,
} from "@/app/actions/media-health"
import {
  galleryPanelClass,
  gallerySans,
  gallerySectionLeadClass,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import {
  issueLabel,
  MEDIA_HEALTH_PAGE_SIZE,
  summarizeFindings,
  type MediaHealthFinding,
} from "@/lib/gallery/media-health"
import {
  describeDeletingLabel,
  describeMediaHealthAllHealthy,
  describeMediaHealthDeleted,
  describeMediaHealthFoundBroken,
} from "@/lib/gallery/media-health-toast"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"
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
import { cn } from "@workspace/ui/lib/utils"

type ScanProgress = {
  scanned: number
  totalRows: number
  pages: number
}

export function MediaHealthPanel() {
  const [isPending, startTransition] = useTransition()
  const [findings, setFindings] = useState<MediaHealthFinding[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [hasScanned, setHasScanned] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const deleteTriggerRef = useRef<HTMLButtonElement>(null)

  const summary = summarizeFindings(findings)
  const selectedCount = selected.size
  const allFindingsSelected =
    findings.length > 0 && findings.every((finding) => selected.has(finding.id))

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllBroken = () => {
    setSelected(new Set(findings.map((f) => f.id)))
  }

  const clearSelection = () => setSelected(new Set())

  const runScan = () => {
    startTransition(async () => {
      setFindings([])
      setSelected(new Set())
      setProgress({ scanned: 0, totalRows: 0, pages: 0 })
      setHasScanned(false)

      let offset = 0
      const collected: MediaHealthFinding[] = []
      let pages = 0
      let scanned = 0

      while (true) {
        const result = await scanGalleryMediaHealthPage(offset)
        if (!result.ok) {
          toast.error(result.error)
          setProgress(null)
          return
        }

        pages += 1
        scanned += result.scanned
        collected.push(...result.findings)
        setFindings([...collected])
        setProgress({
          scanned,
          totalRows: result.totalRows,
          pages,
        })

        if (result.nextOffset == null) break
        offset = result.nextOffset
      }

      setHasScanned(true)
      const finalSummary = summarizeFindings(collected)
      if (finalSummary.total === 0) {
        toast.success(describeMediaHealthAllHealthy(scanned))
      } else {
        toast.message(
          describeMediaHealthFoundBroken({
            broken: finalSummary.total,
            scanned,
          })
        )
      }
    })
  }

  const runDelete = () => {
    const items = findings
      .filter((f) => selected.has(f.id))
      .map((f) => ({
        id: f.id,
        imagePath: f.image_path,
        posterPath: f.poster_path,
      }))

    if (items.length === 0) {
      toast.error("Select at least one broken shot.")
      return
    }

    setConfirmOpen(false)
    startTransition(async () => {
      const result = await adminDeleteBrokenGalleryImages(items)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const deletedIds = new Set(items.map((item) => item.id))
      setFindings((prev) => prev.filter((f) => !deletedIds.has(f.id)))
      setSelected(new Set())
      const message = describeMediaHealthDeleted(result.deleted)
      if (result.warning) {
        toast.warning(message, { description: result.warning })
      } else {
        toast.success(message)
      }
    })
  }

  return (
    <section className={galleryPanelClass()} aria-busy={isPending || undefined}>
      <div className="space-y-1">
        <h2 className={cn(gallerySectionTitleClass(), "text-2xl sm:text-3xl")}>
          Media health
        </h2>
        <p className={gallerySectionLeadClass()}>
          Probe Storage for missing originals and the known 400 thumbnail
          transform failures. Pages of {MEDIA_HEALTH_PAGE_SIZE} — safe for lab
          scale, not a nightly cron.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          aria-busy={isPending || undefined}
          onClick={runScan}
          className={cn(gallerySans(), "gap-1.5")}
        >
          <IconRefresh className="size-3.5" aria-hidden />
          {isPending && progress ? "Scanning…" : "Scan gallery"}
        </Button>

        {findings.length > 0 ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              aria-pressed={allFindingsSelected}
              aria-label={
                allFindingsSelected
                  ? "Clear all selected broken shots"
                  : `Select all ${findings.length} broken shots`
              }
              onClick={() => {
                if (allFindingsSelected) {
                  clearSelection()
                  return
                }
                selectAllBroken()
              }}
              className={gallerySans()}
            >
              {allFindingsSelected
                ? "Clear all"
                : `Select all (${findings.length})`}
            </Button>
            {selected.size > 0 ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={clearSelection}
                  className={gallerySans()}
                >
                  Clear
                </Button>
                <Button
                  ref={deleteTriggerRef}
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setConfirmOpen(true)}
                  className={cn(gallerySans(), "gap-1.5")}
                >
                  <IconTrash className="size-3.5" aria-hidden />
                  Delete selected ({selected.size})
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>

      {progress ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            gallerySans(),
            "mt-3 text-xs text-muted-foreground tabular-nums"
          )}
        >
          Scanned {progress.scanned}
          {progress.totalRows > 0 ? ` / ${progress.totalRows}` : ""} across{" "}
          {progress.pages} page{progress.pages === 1 ? "" : "s"}
          {isPending ? "…" : "."}
        </p>
      ) : null}

      {hasScanned && findings.length === 0 ? (
        <p className={cn(gallerySans(), "mt-4 text-sm text-muted-foreground")}>
          No broken media on this pass.
        </p>
      ) : null}

      {findings.length > 0 ? (
        <div className="mt-4 space-y-3">
          <div
            className={cn(
              gallerySans(),
              "flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wide text-muted-foreground uppercase"
            )}
          >
            <span className="inline-flex items-center gap-1">
              <IconAlertTriangle className="size-3" aria-hidden />
              {summary.total} broken
            </span>
            {summary.missingOriginal > 0 ? (
              <span>{summary.missingOriginal} missing original</span>
            ) : null}
            {summary.missingPoster > 0 ? (
              <span>{summary.missingPoster} missing poster</span>
            ) : null}
            {summary.unreadableThumb > 0 ? (
              <span>{summary.unreadableThumb} unreadable thumb</span>
            ) : null}
            {summary.probeError > 0 ? (
              <span>{summary.probeError} probe error</span>
            ) : null}
          </div>

          <ul className="divide-y divide-zinc-800/10 overflow-hidden rounded-[2px] border border-zinc-800/12 bg-white/70">
            {findings.map((finding) => {
              const checked = selected.has(finding.id)
              return (
                <li
                  key={finding.id}
                  className={cn(
                    gallerySans(),
                    "flex items-start gap-3 px-3 py-3 text-sm sm:px-4"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-3.5 accent-zinc-800"
                    checked={checked}
                    disabled={isPending}
                    onChange={() => toggle(finding.id)}
                    aria-label={`Select ${finding.name}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <a
                        href={buildGalleryPhotoHref({ photoId: finding.id })}
                        className="truncate font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {finding.name}
                      </a>
                      <span className="text-[11px] text-muted-foreground uppercase">
                        {finding.media_type}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {finding.displayPath}
                    </p>
                    <p className="flex flex-wrap gap-1.5 pt-0.5">
                      {finding.issues.map((issue) => (
                        <span
                          key={issue}
                          className="rounded-[2px] border border-amber-900/15 bg-amber-50 px-1.5 py-0.5 text-[10px] tracking-wide text-amber-950/80 uppercase"
                        >
                          {issueLabel(issue)}
                        </span>
                      ))}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) {
            queueMicrotask(() => deleteTriggerRef.current?.focus())
          }
        }}
      >
        <AlertDialogContent aria-busy={isPending || undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {selectedCount} broken shot
              {selectedCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected rows from the gallery and deletes their
              storage objects. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>
              Keep them
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={runDelete}
              disabled={isPending}
              aria-busy={isPending || undefined}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? describeDeletingLabel() : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
