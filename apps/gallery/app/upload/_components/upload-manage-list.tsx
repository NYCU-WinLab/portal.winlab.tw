"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { IconGripVertical } from "@tabler/icons-react"
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
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

import { DownloadSequenceButton } from "@/app/_components/download-sequence-button"
import {
  deleteGalleryImages,
  updateGallerySequenceOrder,
} from "@/app/upload/actions"
import { DeleteButton } from "@/app/upload/_components/delete-button"
import { RenameButton } from "@/app/upload/_components/rename-button"
import { TakenAtEditor } from "@/app/upload/_components/taken-at-editor"
import { UploadListThumb } from "@/app/upload/_components/upload-list-thumb"
import { ViewOnWallLink } from "@/app/upload/_components/view-on-wall-link"
import { PinWallButton } from "@/app/_components/pin-wall-button"
import {
  galleryPanelClass,
  galleryPillClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import { useSequencePointerReorder } from "@/hooks/use-sequence-pointer-reorder"
import { formatUploadedDate } from "@/lib/gallery/format-uploaded-at"
import {
  countIncompleteSequences,
  describeSequenceGaps,
  filterIncompleteSequences,
  findSequenceGaps,
  groupManageUploads,
  looksLikeUploadDayTakenAt,
  swapSequenceOrder,
  type ManageUploadRow,
} from "@/lib/gallery/manage-uploads"
import { resolveWallPhotoId } from "@/lib/gallery/wall-photo-id"
import { getGalleryThumbUrl } from "@/lib/gallery/url"

type SelectableItem = {
  id: string
  imagePath: string
  posterPath: string | null
  name: string
}

function UploadListItem({
  image,
  siblings,
  sequenceControls,
  selected,
  onToggleSelected,
  selectionMode,
  isAdmin = false,
  showWallPin = false,
  sequenceIndex,
  reorderHandle,
}: {
  image: ManageUploadRow
  siblings: ManageUploadRow[]
  sequenceControls?: ReactNode
  selected: boolean
  onToggleSelected: () => void
  selectionMode: boolean
  isAdmin?: boolean
  showWallPin?: boolean
  sequenceIndex?: number
  reorderHandle?: ReactNode
}) {
  const isVideo = image.media_type === "video"
  const thumbPath =
    isVideo && image.poster_path ? image.poster_path : image.image_path
  const wallPhotoId = resolveWallPhotoId(image, siblings)
  const [takenAt, setTakenAt] = useState(image.taken_at ?? null)
  const uploadDayHint = looksLikeUploadDayTakenAt(takenAt, image.created_at)

  return (
    <li
      data-sequence-index={
        typeof sequenceIndex === "number" ? sequenceIndex : undefined
      }
      className={cn(
        galleryPanelClass(),
        "flex items-center gap-3 !p-4 sm:gap-5",
        "data-[sequence-drop-target=true]:ring-2 data-[sequence-drop-target=true]:ring-foreground/40"
      )}
    >
      {reorderHandle}
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Select ${image.name}`}
          className="size-4 shrink-0 accent-foreground"
        />
      ) : null}
      <UploadListThumb
        src={getGalleryThumbUrl(thumbPath, 160)}
        alt={image.name}
        isVideo={isVideo}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            gallerySectionTitleClass(),
            "truncate text-lg sm:text-xl"
          )}
        >
          {image.name}
        </p>
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          {formatUploadedDate(image.created_at)}
          {takenAt ? ` · captured ${formatUploadedDate(takenAt)}` : ""}
          {uploadDayHint ? " · upload day?" : ""}
          {isVideo && image.duration_seconds
            ? ` · ${image.duration_seconds}s video`
            : ""}
          {typeof image.sequence_index === "number"
            ? ` · slot ${image.sequence_index + 1}`
            : ""}
        </p>
        {sequenceControls ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {sequenceControls}
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
        {isAdmin && showWallPin ? (
          <PinWallButton
            imageId={wallPhotoId}
            pinnedAt={image.pinned_at}
            navigateHomeOnPin
          />
        ) : null}
        <ViewOnWallLink photoId={wallPhotoId} />
        <TakenAtEditor
          id={image.id}
          takenAt={takenAt}
          createdAt={image.created_at}
          hintUploadDay={uploadDayHint}
          onUpdated={setTakenAt}
        />
        <RenameButton id={image.id} name={image.name} />
        <DeleteButton
          id={image.id}
          imagePath={image.image_path}
          posterPath={image.poster_path}
          name={image.name}
        />
      </div>
    </li>
  )
}

function SequenceGapRow({ slotIndex }: { slotIndex: number }) {
  return (
    <li
      className={cn(
        galleryPanelClass(),
        "flex items-center gap-4 border-dashed !p-4 opacity-80"
      )}
    >
      <div className="flex size-14 shrink-0 items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/30 text-xs text-muted-foreground">
        ?
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(gallerySans(), "text-sm font-medium text-foreground")}>
          {slotIndex === 0 ? "Missing cover" : `Missing shot ${slotIndex + 1}`}
        </p>
        <p className={cn(gallerySans(), "text-xs text-muted-foreground")}>
          Upload retry should fill slot {slotIndex + 1}. Reorder after the hole
          is filled if you want a different cover.
        </p>
      </div>
    </li>
  )
}

function UploadSequenceGroup({
  sequenceId,
  items: initialItems,
  allImages,
  selectionMode,
  selectedIds,
  onToggleSelected,
  isAdmin = false,
}: {
  sequenceId: string
  items: ManageUploadRow[]
  allImages: ManageUploadRow[]
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  isAdmin?: boolean
}) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()
  const orderedIds = useMemo(() => items.map((item) => item.id), [items])
  const gapInfo = useMemo(
    () => findSequenceGaps(items.map((item) => item.sequence_index)),
    [items]
  )
  const gapLabel = describeSequenceGaps(gapInfo.gaps)

  const persistOrder = (nextIds: string[], nextItems: ManageUploadRow[]) => {
    // Keep client sequence_index dense so Cover / Set cover stay accurate
    // before the server round-trip finishes.
    const densified = nextItems.map((item, index) => ({
      ...item,
      sequence_index: index,
    }))
    setItems(densified)
    startTransition(async () => {
      const result = await updateGallerySequenceOrder(sequenceId, nextIds)
      if (!result.ok) {
        toast.error(result.error)
        setItems(initialItems)
      } else {
        toast.success("Sequence updated.")
      }
    })
  }

  const move = (fromIndex: number, toIndex: number) => {
    const nextIds = swapSequenceOrder(orderedIds, fromIndex, toIndex)
    if (!nextIds) return
    const nextItems = nextIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is ManageUploadRow => Boolean(item))
    persistOrder(nextIds, nextItems)
  }

  const setCover = (index: number) => {
    const item = items[index]
    if (!item) return
    // listIndex 0 is not always the cover when slot 0 is missing.
    if (item.sequence_index === 0) return
    const nextIds = swapSequenceOrder(orderedIds, index, 0)
    if (!nextIds) return
    const nextItems = nextIds
      .map((id) => items.find((row) => row.id === id))
      .filter((row): row is ManageUploadRow => Boolean(row))
    persistOrder(nextIds, nextItems)
  }

  const compactSequence = () => {
    if (items.length === 0) return
    const nextIds = items.map((item) => item.id)
    // Same order, but densified indexes close gaps on the server.
    persistOrder(nextIds, items)
    toast.message("Compacting sequence slots…")
  }

  const {
    listRef,
    onHandlePointerDown,
    onHandlePointerMove,
    onHandlePointerUp,
    onHandlePointerCancel,
  } = useSequencePointerReorder({
    itemCount: items.length,
    disabled: isPending || selectionMode,
    onReorder: move,
  })

  const timelineSlots = useMemo(() => {
    if (gapInfo.maxIndex == null) {
      return items.map((item, listIndex) => ({
        kind: "item" as const,
        item,
        listIndex,
      }))
    }

    const bySlot = new Map<
      number,
      { item: ManageUploadRow; listIndex: number }
    >()
    items.forEach((item, listIndex) => {
      if (typeof item.sequence_index === "number") {
        bySlot.set(item.sequence_index, { item, listIndex })
      }
    })

    const slots: Array<
      | { kind: "item"; item: ManageUploadRow; listIndex: number }
      | { kind: "gap"; slotIndex: number }
    > = []

    for (let slot = 0; slot <= gapInfo.maxIndex; slot++) {
      const hit = bySlot.get(slot)
      if (hit) {
        slots.push({ kind: "item", item: hit.item, listIndex: hit.listIndex })
      } else {
        slots.push({ kind: "gap", slotIndex: slot })
      }
    }

    // Rows without a numeric index still appear at the end.
    items.forEach((item, listIndex) => {
      if (typeof item.sequence_index === "number") return
      slots.push({ kind: "item", item, listIndex })
    })

    return slots
  }, [gapInfo.maxIndex, items])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={cn(
            gallerySans(),
            "text-xs text-muted-foreground uppercase"
          )}
        >
          Sequence story · {items.length} shots · drag handle to reorder
        </p>
        {items.length > 1 ? (
          <DownloadSequenceButton
            variant="pill"
            items={items}
            coverName={items[0]?.name}
            className={galleryPillClass()}
          />
        ) : null}
      </div>
      {gapLabel ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn(gallerySans(), "text-xs text-amber-800")}>
            Incomplete · {gapLabel}
          </p>
          <button
            type="button"
            disabled={isPending}
            onClick={compactSequence}
            className={galleryPillClass()}
          >
            Compact slots
          </button>
        </div>
      ) : null}
      <ul ref={listRef} className="flex flex-col gap-3">
        {timelineSlots.map((slot) => {
          if (slot.kind === "gap") {
            return (
              <SequenceGapRow
                key={`gap-${sequenceId}-${slot.slotIndex}`}
                slotIndex={slot.slotIndex}
              />
            )
          }

          const { item: image, listIndex: index } = slot
          return (
            <UploadListItem
              key={image.id}
              image={image}
              siblings={allImages}
              selected={selectedIds.has(image.id)}
              onToggleSelected={() => onToggleSelected(image.id)}
              selectionMode={selectionMode}
              isAdmin={isAdmin}
              showWallPin={image.sequence_index === 0}
              sequenceIndex={index}
              reorderHandle={
                <button
                  type="button"
                  aria-label={`Reorder ${image.name}`}
                  disabled={isPending || selectionMode}
                  className={cn(
                    "inline-flex size-11 shrink-0 touch-none items-center justify-center rounded-md",
                    "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    "disabled:opacity-40"
                  )}
                  onPointerDown={(event) => onHandlePointerDown(index, event)}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerCancel}
                >
                  <IconGripVertical className="size-5" aria-hidden />
                </button>
              }
              sequenceControls={
                <>
                  {image.sequence_index === 0 ? (
                    <span
                      className={cn(galleryPillClass(), "pointer-events-none")}
                    >
                      Cover
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setCover(index)}
                      className={galleryPillClass()}
                    >
                      Set cover
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isPending || index === 0}
                    onClick={() => move(index, index - 1)}
                    className={galleryPillClass()}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    disabled={isPending || index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                    className={galleryPillClass()}
                  >
                    Down
                  </button>
                </>
              }
            />
          )
        })}
      </ul>
    </div>
  )
}

export function UploadManageList({
  images,
  isAdmin = false,
}: {
  images: ManageUploadRow[]
  isAdmin?: boolean
}) {
  const { singles, sequences } = useMemo(
    () => groupManageUploads(images),
    [images]
  )
  const [sortMode, setSortMode] = useState<"date" | "name">("date")
  const nameCollator = useMemo(
    () => new Intl.Collator("en", { sensitivity: "base", numeric: true }),
    []
  )

  const timeline = useMemo(() => {
    const sequenceEntries = sequences.map((sequence) => {
      const groupCreatedAt = sequence.items.reduce((max, item) => {
        const t = new Date(item.created_at).getTime()
        return t > max ? t : max
      }, 0)
      const sortName = sequence.items[0]?.name ?? ""

      return {
        kind: "sequence" as const,
        sequence,
        groupCreatedAt,
        sortName,
      }
    })

    const singleEntries = singles.map((row) => ({
      kind: "single" as const,
      row,
      groupCreatedAt: new Date(row.created_at).getTime(),
      sortName: row.name,
    }))

    return [...sequenceEntries, ...singleEntries].sort((a, b) => {
      if (sortMode === "name") {
        const byName = nameCollator.compare(a.sortName, b.sortName)
        if (byName !== 0) return byName
      }
      return b.groupCreatedAt - a.groupCreatedAt
    })
  }, [nameCollator, singles, sequences, sortMode])
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [incompleteOnly, setIncompleteOnly] = useState(false)
  const incompleteCount = useMemo(
    () => countIncompleteSequences(sequences),
    [sequences]
  )

  const visibleTimeline = useMemo(() => {
    if (!incompleteOnly) return timeline
    const incompleteIds = new Set(
      filterIncompleteSequences(sequences).map(
        (sequence) => sequence.sequenceId
      )
    )
    return timeline.filter(
      (entry) =>
        entry.kind === "sequence" &&
        incompleteIds.has(entry.sequence.sequenceId)
    )
  }, [incompleteOnly, sequences, timeline])

  const selectableItems = useMemo<SelectableItem[]>(
    () =>
      images.map((image) => ({
        id: image.id,
        imagePath: image.image_path,
        posterPath: image.poster_path,
        name: image.name,
      })),
    [images]
  )

  const selectedItems = selectableItems.filter((item) =>
    selectedIds.has(item.id)
  )

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectionMode = () => {
    setSelectionMode((mode) => {
      if (mode) setSelectedIds(new Set())
      return !mode
    })
  }

  const confirmBatchDelete = () => {
    startTransition(async () => {
      const result = await deleteGalleryImages(selectedItems)
      if (result.ok) {
        toast.success(
          `Deleted ${selectedItems.length} work${selectedItems.length === 1 ? "" : "s"}.`
        )
        setSelectedIds(new Set())
        setSelectionMode(false)
        setConfirmOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  if (images.length === 0) return null

  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selectedIds.has(item.id))
  const selectedPreview = selectedItems
    .slice(0, 4)
    .map((item) => item.name)
    .join(", ")

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={sortMode}
          onValueChange={(value) => {
            if (value === "date" || value === "name") setSortMode(value)
          }}
          className="gap-0"
        >
          <TabsList>
            <TabsTrigger value="date">Newest</TabsTrigger>
            <TabsTrigger value="name">Name</TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          type="button"
          onClick={toggleSelectionMode}
          className={galleryPillClass()}
        >
          {selectionMode ? "Cancel selection" : "Select"}
        </button>
        {incompleteCount > 0 ? (
          <button
            type="button"
            onClick={() => setIncompleteOnly((value) => !value)}
            className={cn(
              galleryPillClass(),
              incompleteOnly && "border-foreground/25 bg-foreground/[0.06]"
            )}
            aria-pressed={incompleteOnly}
          >
            {incompleteOnly
              ? `Incomplete only (${incompleteCount})`
              : `Incomplete (${incompleteCount})`}
          </button>
        ) : null}
        {selectionMode ? (
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                setSelectedIds(new Set())
                return
              }
              setSelectedIds(new Set(selectableItems.map((item) => item.id)))
            }}
            className={galleryPillClass()}
          >
            {allSelected
              ? "Clear all"
              : `Select all (${selectableItems.length})`}
          </button>
        ) : null}
      </div>

      {selectionMode ? (
        <div
          className={cn(
            "fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[min(100%,48rem)] flex-wrap items-center justify-between gap-3 px-4",
            "sm:px-6"
          )}
        >
          <div
            className={cn(
              "flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900/15 bg-card/95 px-4 py-3 shadow-[0_12px_40px_-16px_rgba(24,24,27,0.45)] backdrop-blur-md"
            )}
            role="status"
            aria-live="polite"
          >
            <p className={cn(gallerySans(), "text-sm text-foreground")}>
              {selectedItems.length === 0
                ? "Tap works to select"
                : `${selectedItems.length} of ${selectableItems.length} selected`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allSelected) {
                    setSelectedIds(new Set())
                    return
                  }
                  setSelectedIds(
                    new Set(selectableItems.map((item) => item.id))
                  )
                }}
                className={galleryPillClass()}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={isPending || selectedItems.length === 0}
                className={cn(
                  galleryPillClass(),
                  "border-destructive/30 text-destructive disabled:opacity-40"
                )}
              >
                Delete selected
                {selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {visibleTimeline.length === 0 && incompleteOnly ? (
        <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
          No incomplete sequences right now — every story has contiguous shots.
        </p>
      ) : null}

      {visibleTimeline.map((entry) => {
        if (entry.kind === "sequence") {
          return (
            <UploadSequenceGroup
              key={entry.sequence.sequenceId}
              sequenceId={entry.sequence.sequenceId}
              items={entry.sequence.items}
              allImages={images}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              isAdmin={isAdmin}
            />
          )
        }

        return (
          <ul key={entry.row.id} className="flex flex-col gap-3">
            <UploadListItem
              image={entry.row}
              siblings={images}
              selected={selectedIds.has(entry.row.id)}
              onToggleSelected={() => toggleSelected(entry.row.id)}
              selectionMode={selectionMode}
              isAdmin={isAdmin}
              showWallPin
            />
          </ul>
        )
      })}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Permanently delete {selectedItems.length} work
              {selectedItems.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This removes the selected works from the gallery and storage.
                  Cannot be undone.
                </p>
                {selectedPreview ? (
                  <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-foreground/80">
                    {selectedPreview}
                    {selectedItems.length > 4
                      ? ` (+${selectedItems.length - 4} more)`
                      : ""}
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBatchDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
