"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
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
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

import { DownloadSequenceButton } from "@/app/_components/download-sequence-button"
import { GalleryAddToAlbum } from "@/app/_components/gallery-add-to-album"
import { GalleryKeyboardCheatsheet } from "@/app/_components/gallery-keyboard-cheatsheet"
import { AlbumSlideshow } from "@/app/albums/_components/album-slideshow"
import { createGalleryAlbumWithImages } from "@/app/actions/albums"
import { setGalleryImagesPin } from "@/app/actions"
import { setGalleryFavorites } from "@/app/actions/favorites"
import {
  deleteGalleryImages,
  updateGalleryImagesTakenAt,
  updateGallerySequenceOrder,
} from "@/app/upload/actions"
import {
  attachGalleryTagToImages,
  detachGalleryTagFromImagesBySlug,
} from "@/app/actions/tags"
import { DeleteButton } from "@/app/upload/_components/delete-button"
import { ManageTagsEditor } from "@/app/upload/_components/manage-tags-editor"
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
  describeBulkTagAttach,
  describeBulkTagDetach,
} from "@/lib/gallery/bulk-tag"
import { downloadAlbumZip } from "@/lib/gallery/download-album"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import {
  selectWallIdRange,
  toggleWallSelection,
} from "@/lib/gallery/wall-selection"
import {
  shuffleSlideshowPhotos,
  type GallerySlideshowPhoto,
} from "@/lib/gallery/slideshow"
import {
  countIncompleteSequences,
  countUploadDayRows,
  describeSequenceGaps,
  filterIncompleteSequences,
  findSequenceGaps,
  flattenVisibleManageIds,
  manageSelectionToSlideshowPhotos,
  expandManageSelectionSlideshowPhotos,
  expandManageSelectionZipItems,
  resolveManageSelectionWallPhotoIds,
  pruneManageSelectionIds,
  groupManageUploads,
  looksLikeUploadDayTakenAt,
  rowNeedsCaptureDate,
  swapSequenceOrder,
  type ManageUploadRow,
} from "@/lib/gallery/manage-uploads"
import { resolveWallPhotoId } from "@/lib/gallery/wall-photo-id"
import { getGalleryThumbUrl } from "@/lib/gallery/url"
import {
  fromTaipeiDateInput,
  toTaipeiDateInput,
} from "@/lib/gallery/taipei-date-input"
import {
  buildWallSelectionShareText,
  describeWallSelectionCopy,
} from "@/lib/gallery/wall-selection-share"
import { describeAlbumFromSelection } from "@/lib/gallery/album-from-selection"
import { buildAlbumZipFilename } from "@/lib/gallery/zip-names"
import { describeZipDownloadResult } from "@/lib/gallery/zip-result"

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
  takenAtAvailable = true,
  tagsAvailable = true,
  sequenceIndex,
  reorderHandle,
}: {
  image: ManageUploadRow
  siblings: ManageUploadRow[]
  sequenceControls?: ReactNode
  selected: boolean
  onToggleSelected: (options?: { shiftKey?: boolean }) => void
  selectionMode: boolean
  isAdmin?: boolean
  showWallPin?: boolean
  takenAtAvailable?: boolean
  tagsAvailable?: boolean
  sequenceIndex?: number
  reorderHandle?: ReactNode
}) {
  const isVideo = image.media_type === "video"
  const thumbPath =
    isVideo && image.poster_path ? image.poster_path : image.image_path
  const wallPhotoId = resolveWallPhotoId(image, siblings)
  const [takenAt, setTakenAt] = useState(image.taken_at ?? null)
  const uploadDayHint =
    takenAtAvailable && looksLikeUploadDayTakenAt(takenAt, image.created_at)

  return (
    <li
      data-sequence-index={
        typeof sequenceIndex === "number" ? sequenceIndex : undefined
      }
      aria-selected={selectionMode ? selected : undefined}
      role={selectionMode ? "option" : undefined}
      onClick={
        selectionMode
          ? (event) => {
              const target = event.target as HTMLElement | null
              if (
                target?.closest(
                  "button, a, input, label, [role='button'], [data-manage-actions]"
                )
              ) {
                return
              }
              onToggleSelected({ shiftKey: event.shiftKey })
            }
          : undefined
      }
      className={cn(
        galleryPanelClass(),
        "flex items-center gap-3 !p-4 sm:gap-5",
        "data-[sequence-drop-target=true]:ring-2 data-[sequence-drop-target=true]:ring-foreground/40",
        selectionMode && "cursor-pointer",
        selectionMode &&
          selected &&
          "border-foreground/35 bg-foreground/[0.07] shadow-[inset_3px_0_0_0_currentColor] ring-2 ring-foreground/25"
      )}
    >
      {reorderHandle}
      {selectionMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected()}
          onClick={(event) => {
            event.stopPropagation()
            if (!event.shiftKey) return
            event.preventDefault()
            onToggleSelected({ shiftKey: true })
          }}
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
          {takenAtAvailable && takenAt
            ? ` · captured ${formatUploadedDate(takenAt)}`
            : ""}
          {uploadDayHint ? " · upload day?" : ""}
          {isVideo && image.duration_seconds
            ? ` · ${image.duration_seconds}s video`
            : ""}
          {typeof image.sequence_index === "number"
            ? ` · slot ${image.sequence_index + 1}`
            : ""}
        </p>
        {sequenceControls ? (
          <div
            className="flex flex-wrap items-center gap-2 pt-1"
            data-manage-actions
            onClick={(event) => event.stopPropagation()}
          >
            {sequenceControls}
          </div>
        ) : null}
      </div>
      <div
        className="flex shrink-0 flex-wrap items-center justify-end gap-1"
        data-manage-actions
        onClick={(event) => event.stopPropagation()}
      >
        {selectionMode ? null : (
          <>
            {isAdmin && showWallPin ? (
              <PinWallButton
                imageId={wallPhotoId}
                pinnedAt={image.pinned_at}
                navigateHomeOnPin
              />
            ) : null}
            <ViewOnWallLink photoId={wallPhotoId} name={image.name} />
            {takenAtAvailable ? (
              <TakenAtEditor
                id={image.id}
                takenAt={takenAt}
                createdAt={image.created_at}
                imageName={image.name}
                hintUploadDay={uploadDayHint}
                onUpdated={setTakenAt}
              />
            ) : null}
            {tagsAvailable ? (
              <ManageTagsEditor imageId={image.id} imageName={image.name} />
            ) : null}
            <RenameButton id={image.id} name={image.name} />
            <DeleteButton
              id={image.id}
              imagePath={image.image_path}
              posterPath={image.poster_path}
              name={image.name}
            />
          </>
        )}
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
  takenAtAvailable = true,
  tagsAvailable = true,
  pinAvailable = true,
}: {
  sequenceId: string
  items: ManageUploadRow[]
  allImages: ManageUploadRow[]
  selectionMode: boolean
  selectedIds: Set<string>
  onToggleSelected: (id: string, options?: { shiftKey?: boolean }) => void
  isAdmin?: boolean
  takenAtAvailable?: boolean
  tagsAvailable?: boolean
  pinAvailable?: boolean
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
          {selectionMode
            ? `Sequence story · ${items.length} shots`
            : `Sequence story · ${items.length} shots · drag handle to reorder`}
        </p>
        {!selectionMode && items.length > 1 ? (
          <DownloadSequenceButton
            variant="pill"
            items={items}
            coverName={items[0]?.name}
            className={galleryPillClass()}
          />
        ) : null}
      </div>
      {gapLabel && !selectionMode ? (
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
      <ul
        ref={listRef}
        className="flex flex-col gap-3"
        role={selectionMode ? "listbox" : undefined}
        aria-multiselectable={selectionMode ? true : undefined}
        aria-label={selectionMode ? "Select works in this sequence" : undefined}
      >
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
              onToggleSelected={(options) =>
                onToggleSelected(image.id, options)
              }
              selectionMode={selectionMode}
              isAdmin={isAdmin}
              showWallPin={pinAvailable && image.sequence_index === 0}
              takenAtAvailable={takenAtAvailable}
              tagsAvailable={tagsAvailable}
              sequenceIndex={index}
              reorderHandle={
                selectionMode ? null : (
                  <button
                    type="button"
                    aria-label={`Reorder ${image.name}`}
                    disabled={isPending}
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
                )
              }
              sequenceControls={
                selectionMode ? undefined : (
                  <>
                    {image.sequence_index === 0 ? (
                      <span
                        className={cn(
                          galleryPillClass(),
                          "pointer-events-none"
                        )}
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
                )
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
  takenAtAvailable = true,
  favoritesAvailable = true,
  tagsAvailable = true,
  albumsAvailable = true,
  pinAvailable = true,
  sequencesAvailable = true,
}: {
  images: ManageUploadRow[]
  isAdmin?: boolean
  takenAtAvailable?: boolean
  favoritesAvailable?: boolean
  tagsAvailable?: boolean
  albumsAvailable?: boolean
  pinAvailable?: boolean
  sequencesAvailable?: boolean
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
  const [bulkDateOpen, setBulkDateOpen] = useState(false)
  const [bulkDateDraft, setBulkDateDraft] = useState("")
  const [bulkTagOpen, setBulkTagOpen] = useState(false)
  const [bulkTagDraft, setBulkTagDraft] = useState("")
  const [bulkUntagOpen, setBulkUntagOpen] = useState(false)
  const [bulkUntagDraft, setBulkUntagDraft] = useState("")
  const [bulkAlbumOpen, setBulkAlbumOpen] = useState(false)
  const [bulkAlbumDraft, setBulkAlbumDraft] = useState("")
  const [slideshowOpen, setSlideshowOpen] = useState(false)
  const [slideshowDeck, setSlideshowDeck] = useState<GallerySlideshowPhoto[]>(
    []
  )
  const [slideshowTitle, setSlideshowTitle] = useState("Manage selection")
  const slideshowButtonRef = useRef<HTMLButtonElement>(null)
  const bulkDialogTriggerRef = useRef<HTMLElement | null>(null)
  const [zipBusy, setZipBusy] = useState(false)
  const copyLinksBusyRef = useRef(false)
  const [isPending, startTransition] = useTransition()

  const rememberBulkTrigger = (target: EventTarget | null) => {
    if (target instanceof HTMLElement) {
      bulkDialogTriggerRef.current = target
    }
  }

  const handleBulkDialogOpenChange =
    (setOpen: (open: boolean) => void) => (open: boolean) => {
      setOpen(open)
      if (!open) {
        const trigger = bulkDialogTriggerRef.current
        bulkDialogTriggerRef.current = null
        queueMicrotask(() => trigger?.focus())
      }
    }
  const [incompleteOnly, setIncompleteOnly] = useState(false)
  const [uploadDayOnly, setUploadDayOnly] = useState(false)
  const incompleteCount = useMemo(
    () => countIncompleteSequences(sequences),
    [sequences]
  )
  const uploadDayCount = useMemo(
    () => (takenAtAvailable ? countUploadDayRows(images) : 0),
    [images, takenAtAvailable]
  )

  const visibleTimeline = useMemo(() => {
    let next = timeline
    if (incompleteOnly && sequencesAvailable) {
      const incompleteIds = new Set(
        filterIncompleteSequences(sequences).map(
          (sequence) => sequence.sequenceId
        )
      )
      next = next.filter(
        (entry) =>
          entry.kind === "sequence" &&
          incompleteIds.has(entry.sequence.sequenceId)
      )
    }
    if (uploadDayOnly && takenAtAvailable) {
      next = next
        .map((entry) => {
          if (entry.kind === "single") {
            return rowNeedsCaptureDate(entry.row) ? entry : null
          }
          const items = entry.sequence.items.filter(rowNeedsCaptureDate)
          if (items.length === 0) return null
          return {
            ...entry,
            sequence: { ...entry.sequence, items },
          }
        })
        .filter((entry): entry is (typeof timeline)[number] => entry != null)
    }
    return next
  }, [
    incompleteOnly,
    sequences,
    sequencesAvailable,
    timeline,
    uploadDayOnly,
    takenAtAvailable,
  ])

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

  const visibleSelectableItems = useMemo(() => {
    const visibleIds = new Set(flattenVisibleManageIds(visibleTimeline))
    return selectableItems.filter((item) => visibleIds.has(item.id))
  }, [selectableItems, visibleTimeline])

  const selectedItems = selectableItems.filter((item) =>
    selectedIds.has(item.id)
  )
  const selectedVisibleItems = visibleSelectableItems.filter((item) =>
    selectedIds.has(item.id)
  )

  const selectionAnchorIdRef = useRef<string | null>(null)
  const visibleOrderIds = useMemo(
    () => flattenVisibleManageIds(visibleTimeline),
    [visibleTimeline]
  )

  const orderedSelectedIds = useMemo(
    () => visibleOrderIds.filter((id) => selectedIds.has(id)),
    [visibleOrderIds, selectedIds]
  )
  const selectedSlideshowPhotos = useMemo(
    () => manageSelectionToSlideshowPhotos(orderedSelectedIds, images),
    [orderedSelectedIds, images]
  )
  const selectedStorySlideshowPhotos = useMemo(
    () => expandManageSelectionSlideshowPhotos(orderedSelectedIds, images),
    [orderedSelectedIds, images]
  )
  const canSlideshow = selectedSlideshowPhotos.length > 0
  const canStorySlideshow = selectedStorySlideshowPhotos.length > 0
  const selectedZipCount = useMemo(
    () => expandManageSelectionZipItems(orderedSelectedIds, images).length,
    [orderedSelectedIds, images]
  )
  const selectedWallLinkCount = useMemo(
    () => resolveManageSelectionWallPhotoIds(orderedSelectedIds, images).length,
    [orderedSelectedIds, images]
  )

  const toggleSelected = (id: string, options?: { shiftKey?: boolean }) => {
    const anchor = selectionAnchorIdRef.current
    setSelectedIds((prev) => {
      if (options?.shiftKey && anchor) {
        return selectWallIdRange(prev, visibleOrderIds, anchor, id)
      }
      return toggleWallSelection(prev, id)
    })
    if (!options?.shiftKey) {
      selectionAnchorIdRef.current = id
    }
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
    selectionAnchorIdRef.current = null
  }

  const endSelectionMode = () => {
    clearSelection()
    setSelectionMode(false)
  }

  const toggleSelectionMode = () => {
    setSelectionMode((mode) => {
      if (mode) clearSelection()
      return !mode
    })
  }

  useEffect(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
    selectionAnchorIdRef.current = null
  }, [incompleteOnly, uploadDayOnly])

  useEffect(() => {
    const validIds = new Set(images.map((image) => image.id))
    setSelectedIds((prev) => pruneManageSelectionIds(prev, validIds))
    if (
      selectionAnchorIdRef.current &&
      !validIds.has(selectionAnchorIdRef.current)
    ) {
      selectionAnchorIdRef.current = null
    }
  }, [images])

  useEffect(() => {
    if (selectionMode) return
    if (!incompleteOnly && !uploadDayOnly) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (
        confirmOpen ||
        bulkDateOpen ||
        bulkTagOpen ||
        bulkUntagOpen ||
        bulkAlbumOpen ||
        slideshowOpen
      )
        return
      if (event.key !== "Escape") return
      event.preventDefault()
      setIncompleteOnly(false)
      setUploadDayOnly(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    selectionMode,
    incompleteOnly,
    uploadDayOnly,
    confirmOpen,
    bulkDateOpen,
    bulkTagOpen,
    bulkUntagOpen,
    bulkAlbumOpen,
    slideshowOpen,
  ])

  useEffect(() => {
    if (!selectionMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (
        confirmOpen ||
        bulkDateOpen ||
        bulkTagOpen ||
        bulkUntagOpen ||
        bulkAlbumOpen ||
        slideshowOpen
      )
        return
      if (event.key === "Escape") {
        event.preventDefault()
        endSelectionMode()
        return
      }
      if (
        (event.key === "a" || event.key === "A") &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        setSelectedIds((current) => {
          const allVisibleSelected =
            visibleSelectableItems.length > 0 &&
            visibleSelectableItems.every((item) => current.has(item.id))
          if (allVisibleSelected) {
            selectionAnchorIdRef.current = null
            return new Set()
          }
          const next = new Set(visibleSelectableItems.map((item) => item.id))
          selectionAnchorIdRef.current =
            visibleSelectableItems[visibleSelectableItems.length - 1]?.id ??
            null
          return next
        })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [
    selectionMode,
    confirmOpen,
    bulkDateOpen,
    bulkTagOpen,
    bulkUntagOpen,
    bulkAlbumOpen,
    slideshowOpen,
    visibleSelectableItems,
  ])

  const confirmBatchDelete = () => {
    if (isPending) return
    startTransition(async () => {
      const result = await deleteGalleryImages(selectedItems)
      if (result.ok) {
        const message = `Deleted ${selectedItems.length} work${selectedItems.length === 1 ? "" : "s"}.`
        if (result.warning) {
          toast.warning(message, { description: result.warning })
        } else {
          toast.success(message)
        }
        endSelectionMode()
        setConfirmOpen(false)
      } else {
        toast.error(result.error)
      }
    })
  }

  const openBulkDate = () => {
    const first = images.find((image) => selectedIds.has(image.id))
    setBulkDateDraft(
      toTaipeiDateInput(first?.taken_at ?? first?.created_at ?? null)
    )
    setBulkDateOpen(true)
  }

  const confirmBulkDate = () => {
    if (isPending) return
    if (!bulkDateDraft.trim()) {
      toast.error("Pick a capture date.")
      return
    }
    startTransition(async () => {
      const result = await updateGalleryImagesTakenAt(
        selectedItems.map((item) => item.id),
        fromTaipeiDateInput(bulkDateDraft)
      )
      if (result.ok) {
        toast.success(
          `Set capture date on ${result.updated} work${result.updated === 1 ? "" : "s"}.`
        )
        setBulkDateOpen(false)
        endSelectionMode()
      } else {
        toast.error(result.error)
      }
    })
  }

  const confirmBulkTag = () => {
    if (isPending) return
    const name = bulkTagDraft.trim()
    if (!name) {
      toast.error("Enter a tag.")
      return
    }
    startTransition(async () => {
      const result = await attachGalleryTagToImages(
        selectedItems.map((item) => item.id),
        name
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        describeBulkTagAttach({
          tagName: result.data.tag.name,
          attached: result.data.attached,
          selected: selectedItems.length,
        })
      )
      setBulkTagOpen(false)
      setBulkTagDraft("")
      endSelectionMode()
    })
  }

  const confirmBulkUntag = () => {
    if (isPending) return
    const slug = bulkUntagDraft.trim()
    if (!slug) {
      toast.error("Enter a tag slug to remove.")
      return
    }
    startTransition(async () => {
      const result = await detachGalleryTagFromImagesBySlug(
        selectedItems.map((item) => item.id),
        slug
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(
        describeBulkTagDetach({
          tagName: result.data.tagName,
          detached: result.data.detached,
        })
      )
      setBulkUntagOpen(false)
      setBulkUntagDraft("")
      endSelectionMode()
    })
  }

  const downloadSelectedZip = async () => {
    if (zipBusy || orderedSelectedIds.length === 0) return
    const zipItems = expandManageSelectionZipItems(orderedSelectedIds, images)
    if (zipItems.length === 0) return
    setZipBusy(true)
    const toastId = toast.loading(`Preparing selection… 0/${zipItems.length}`)
    try {
      const result = await downloadAlbumZip(zipItems, {
        zipName: buildAlbumZipFilename("manage-selection"),
        onProgress: ({ completed, total }) => {
          toast.loading(`Preparing selection… ${completed}/${total}`, {
            id: toastId,
          })
        },
      })
      const copy = describeZipDownloadResult({
        count: result.count,
        failed: result.failed,
        noun: "work",
      })
      if (copy.severity === "warning") {
        toast.warning(copy.title, {
          id: toastId,
          description: copy.description,
        })
      } else {
        toast.success(copy.title, { id: toastId })
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not build the ZIP"
      toast.error(message, { id: toastId })
    } finally {
      setZipBusy(false)
    }
  }

  const copySelectedLinks = async () => {
    if (
      isPending ||
      orderedSelectedIds.length === 0 ||
      copyLinksBusyRef.current
    ) {
      return
    }
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    if (!origin) {
      toast.error("Could not copy links in this context.")
      return
    }
    const photoIds = resolveManageSelectionWallPhotoIds(
      orderedSelectedIds,
      images
    )
    if (photoIds.length === 0) return
    copyLinksBusyRef.current = true
    const text = buildWallSelectionShareText(photoIds, origin)
    try {
      await navigator.clipboard.writeText(text)
      toast.success(describeWallSelectionCopy(photoIds.length))
    } catch {
      toast.error("Could not copy to the clipboard.")
    } finally {
      copyLinksBusyRef.current = false
    }
  }

  const pinSelected = (pinned: boolean) => {
    if (!isAdmin || !pinAvailable || selectedItems.length === 0 || isPending)
      return
    startTransition(async () => {
      const result = await setGalleryImagesPin(
        selectedItems.map((item) => item.id),
        pinned
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.data.message)
      endSelectionMode()
    })
  }

  const setSelectedFavorites = (saved: boolean) => {
    if (!favoritesAvailable || selectedItems.length === 0 || isPending) return
    startTransition(async () => {
      const result = await setGalleryFavorites(
        selectedItems.map((item) => item.id),
        saved
      )
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      endSelectionMode()
    })
  }

  const createAlbumFromSelection = () => {
    if (!albumsAvailable || isPending) return
    const title = bulkAlbumDraft.trim()
    if (!title || selectedItems.length === 0) return
    startTransition(async () => {
      const result = await createGalleryAlbumWithImages({
        title,
        imageIds: selectedItems.map((item) => item.id),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { title: albumTitle, slug, added } = result.data
      toast.success(describeAlbumFromSelection({ title: albumTitle, added }), {
        description: `/albums/${slug}`,
        action: {
          label: "Open",
          onClick: () => {
            window.location.href = `/albums/${slug}`
          },
        },
      })
      setBulkAlbumDraft("")
      setBulkAlbumOpen(false)
      selectionAnchorIdRef.current = null
      endSelectionMode()
    })
  }
  const handleSlideshowOpenChange = (open: boolean) => {
    setSlideshowOpen(open)
    if (!open) {
      queueMicrotask(() => slideshowButtonRef.current?.focus())
    }
  }

  const openSlideshow = (
    mode: "covers" | "shuffled" | "stories" = "covers"
  ) => {
    const source =
      mode === "stories"
        ? selectedStorySlideshowPhotos
        : selectedSlideshowPhotos
    if (source.length === 0) return
    setSlideshowDeck(
      mode === "shuffled" ? shuffleSlideshowPhotos(source) : source
    )
    setSlideshowTitle(
      mode === "shuffled"
        ? "Manage selection · shuffled"
        : mode === "stories"
          ? "Manage selection · stories"
          : "Manage selection"
    )
    handleSlideshowOpenChange(true)
  }

  if (images.length === 0) return null

  const allSelected =
    visibleSelectableItems.length > 0 &&
    visibleSelectableItems.every((item) => selectedIds.has(item.id))
  const selectedPreview = selectedItems
    .slice(0, 4)
    .map((item) => item.name)
    .join(", ")

  let selectionStatusText = "Tap works to select"
  if (selectedVisibleItems.length > 0) {
    selectionStatusText = `${selectedVisibleItems.length} of ${visibleSelectableItems.length} selected`
    const extras: string[] = []
    if (
      selectedWallLinkCount > 0 &&
      selectedWallLinkCount !== selectedVisibleItems.length
    ) {
      extras.push(
        `${selectedWallLinkCount} wall link${selectedWallLinkCount === 1 ? "" : "s"}`
      )
    }
    if (
      selectedZipCount > 0 &&
      selectedZipCount !== selectedVisibleItems.length
    ) {
      extras.push(`${selectedZipCount} in ZIP`)
    }
    if (extras.length > 0) {
      selectionStatusText = `${selectionStatusText} · ${extras.join(" · ")}`
    }
  }

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
          aria-pressed={selectionMode}
          className={galleryPillClass()}
        >
          {selectionMode ? "Cancel selection" : "Select"}
        </button>
        {selectionMode ? (
          <span className={cn(gallerySans(), "text-xs text-muted-foreground")}>
            Shift+click or click a row for ranges · A selects visible
          </span>
        ) : null}
        {sequencesAvailable && incompleteCount > 0 ? (
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
        {uploadDayCount > 0 ? (
          <button
            type="button"
            onClick={() => setUploadDayOnly((value) => !value)}
            className={cn(
              galleryPillClass(),
              uploadDayOnly && "border-foreground/25 bg-foreground/[0.06]"
            )}
            aria-pressed={uploadDayOnly}
          >
            {uploadDayOnly
              ? `Upload day only (${uploadDayCount})`
              : `Upload day? (${uploadDayCount})`}
          </button>
        ) : null}
        {selectionMode ? (
          <button
            type="button"
            onClick={() => {
              if (allSelected) {
                clearSelection()
                return
              }
              setSelectedIds(
                new Set(visibleSelectableItems.map((item) => item.id))
              )
              selectionAnchorIdRef.current =
                visibleSelectableItems[visibleSelectableItems.length - 1]?.id ??
                null
            }}
            aria-pressed={allSelected}
            aria-label={
              allSelected
                ? "Clear all selected works"
                : `Select all ${visibleSelectableItems.length} visible works`
            }
            className={galleryPillClass()}
          >
            {allSelected
              ? "Clear all"
              : `Select all (${visibleSelectableItems.length})`}
          </button>
        ) : null}
        <GalleryKeyboardCheatsheet
          manage
          slideshowOpen={slideshowOpen}
          className="ml-auto sm:ml-0"
        />
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
              {selectionStatusText}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (allSelected) {
                    clearSelection()
                    return
                  }
                  setSelectedIds(
                    new Set(visibleSelectableItems.map((item) => item.id))
                  )
                  selectionAnchorIdRef.current =
                    visibleSelectableItems[visibleSelectableItems.length - 1]
                      ?.id ?? null
                }}
                aria-pressed={allSelected}
                aria-label={
                  allSelected
                    ? "Clear all selected works"
                    : `Select all ${visibleSelectableItems.length} visible works`
                }
                className={galleryPillClass()}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              {albumsAvailable ? (
                <>
                  <GalleryAddToAlbum
                    imageIds={selectedItems.map((item) => item.id)}
                    triggerLabel={
                      selectedItems.length > 0
                        ? `Album (${selectedItems.length})`
                        : "Album"
                    }
                    triggerClassName={cn(
                      galleryPillClass(),
                      "h-auto gap-0 !text-xs normal-case",
                      (isPending || selectedItems.length === 0) && "opacity-40"
                    )}
                    onAdded={() => {
                      endSelectionMode()
                    }}
                  />
                  <button
                    type="button"
                    onClick={(event) => {
                      rememberBulkTrigger(event.currentTarget)
                      setBulkAlbumDraft("")
                      setBulkAlbumOpen(true)
                    }}
                    disabled={isPending || selectedItems.length === 0}
                    className={cn(galleryPillClass(), "disabled:opacity-40")}
                  >
                    New album
                    {selectedItems.length > 0
                      ? ` (${selectedItems.length})`
                      : ""}
                  </button>
                </>
              ) : null}
              <button
                ref={slideshowButtonRef}
                type="button"
                onClick={() => openSlideshow("covers")}
                disabled={!canSlideshow}
                className={cn(galleryPillClass(), "disabled:opacity-40")}
              >
                Play
                {canSlideshow ? ` (${selectedSlideshowPhotos.length})` : ""}
              </button>
              {tagsAvailable ? (
                <button
                  type="button"
                  onClick={(event) => {
                    rememberBulkTrigger(event.currentTarget)
                    setBulkTagDraft("")
                    setBulkTagOpen(true)
                  }}
                  disabled={isPending || selectedItems.length === 0}
                  className={cn(galleryPillClass(), "disabled:opacity-40")}
                >
                  Tag
                  {selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  rememberBulkTrigger(event.currentTarget)
                  setConfirmOpen(true)
                }}
                disabled={isPending || selectedItems.length === 0}
                className={cn(
                  galleryPillClass(),
                  "border-destructive/30 text-destructive disabled:opacity-40"
                )}
              >
                Delete
                {selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}
              </button>
              <div className="hidden flex-wrap items-center gap-2 sm:flex">
                {takenAtAvailable ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      rememberBulkTrigger(event.currentTarget)
                      openBulkDate()
                    }}
                    disabled={isPending || selectedItems.length === 0}
                    className={cn(galleryPillClass(), "disabled:opacity-40")}
                  >
                    Set date
                    {selectedItems.length > 0
                      ? ` (${selectedItems.length})`
                      : ""}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void downloadSelectedZip()}
                  disabled={isPending || zipBusy || selectedZipCount === 0}
                  aria-busy={zipBusy}
                  className={cn(galleryPillClass(), "disabled:opacity-40")}
                >
                  {zipBusy
                    ? "ZIP…"
                    : selectedZipCount > 0
                      ? `ZIP (${selectedZipCount})`
                      : "ZIP"}
                </button>
                <button
                  type="button"
                  onClick={() => void copySelectedLinks()}
                  disabled={isPending || selectedWallLinkCount === 0}
                  aria-busy={isPending || undefined}
                  className={cn(galleryPillClass(), "disabled:opacity-40")}
                >
                  Links
                  {selectedWallLinkCount > 0
                    ? ` (${selectedWallLinkCount})`
                    : ""}
                </button>
                {tagsAvailable ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      rememberBulkTrigger(event.currentTarget)
                      setBulkUntagDraft("")
                      setBulkUntagOpen(true)
                    }}
                    disabled={isPending || selectedItems.length === 0}
                    className={cn(galleryPillClass(), "disabled:opacity-40")}
                  >
                    Untag
                    {selectedItems.length > 0
                      ? ` (${selectedItems.length})`
                      : ""}
                  </button>
                ) : null}
                {favoritesAvailable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedFavorites(true)}
                      disabled={isPending || selectedItems.length === 0}
                      aria-busy={isPending || undefined}
                      className={cn(galleryPillClass(), "disabled:opacity-40")}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFavorites(false)}
                      disabled={isPending || selectedItems.length === 0}
                      aria-busy={isPending || undefined}
                      className={cn(galleryPillClass(), "disabled:opacity-40")}
                    >
                      Unsave
                    </button>
                  </>
                ) : null}
                {isAdmin && pinAvailable ? (
                  <>
                    <button
                      type="button"
                      onClick={() => pinSelected(true)}
                      disabled={isPending || selectedItems.length === 0}
                      aria-busy={isPending || undefined}
                      className={cn(galleryPillClass(), "disabled:opacity-40")}
                    >
                      Pin
                    </button>
                    <button
                      type="button"
                      onClick={() => pinSelected(false)}
                      disabled={isPending || selectedItems.length === 0}
                      aria-busy={isPending || undefined}
                      className={cn(galleryPillClass(), "disabled:opacity-40")}
                    >
                      Unpin
                    </button>
                  </>
                ) : null}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={isPending || selectedItems.length === 0}
                    className={cn(
                      galleryPillClass(),
                      "disabled:opacity-40 sm:hidden"
                    )}
                    aria-label="More selection actions"
                    onClick={(event) =>
                      rememberBulkTrigger(event.currentTarget)
                    }
                  >
                    More
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  {albumsAvailable ? (
                    <DropdownMenuItem
                      disabled={isPending || selectedItems.length === 0}
                      onSelect={() => {
                        setBulkAlbumDraft("")
                        setBulkAlbumOpen(true)
                      }}
                    >
                      New album…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!canSlideshow}
                    onSelect={() => openSlideshow("shuffled")}
                  >
                    Play shuffled
                  </DropdownMenuItem>
                  {canStorySlideshow &&
                  selectedStorySlideshowPhotos.length !==
                    selectedSlideshowPhotos.length ? (
                    <DropdownMenuItem
                      disabled={!canStorySlideshow}
                      onSelect={() => openSlideshow("stories")}
                    >
                      Play with stories
                    </DropdownMenuItem>
                  ) : null}
                  {takenAtAvailable ? (
                    <DropdownMenuItem
                      disabled={isPending || selectedItems.length === 0}
                      onSelect={openBulkDate}
                    >
                      Set date
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={isPending || zipBusy || selectedZipCount === 0}
                    aria-busy={zipBusy}
                    onSelect={() => void downloadSelectedZip()}
                  >
                    {selectedZipCount > 0 ? `ZIP (${selectedZipCount})` : "ZIP"}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isPending || selectedWallLinkCount === 0}
                    onSelect={() => void copySelectedLinks()}
                  >
                    {selectedWallLinkCount > 0
                      ? `Links (${selectedWallLinkCount})`
                      : "Links"}
                  </DropdownMenuItem>
                  {tagsAvailable ? (
                    <DropdownMenuItem
                      disabled={isPending || selectedItems.length === 0}
                      onSelect={() => {
                        setBulkUntagDraft("")
                        setBulkUntagOpen(true)
                      }}
                    >
                      Untag
                    </DropdownMenuItem>
                  ) : null}
                  {favoritesAvailable ? (
                    <>
                      <DropdownMenuItem
                        disabled={isPending || selectedItems.length === 0}
                        onSelect={() => setSelectedFavorites(true)}
                      >
                        Save
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isPending || selectedItems.length === 0}
                        onSelect={() => setSelectedFavorites(false)}
                      >
                        Unsave
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {isAdmin && pinAvailable ? (
                    <>
                      <DropdownMenuItem
                        disabled={isPending || selectedItems.length === 0}
                        onSelect={() => pinSelected(true)}
                      >
                        Pin
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={isPending || selectedItems.length === 0}
                        onSelect={() => pinSelected(false)}
                      >
                        Unpin
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      ) : null}

      {visibleTimeline.length === 0 && incompleteOnly && sequencesAvailable ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            No incomplete sequences right now — every story has contiguous
            shots.
          </p>
          <button
            type="button"
            className={cn(
              gallerySans(),
              "text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            )}
            onClick={() => {
              setIncompleteOnly(false)
              setUploadDayOnly(false)
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
      {visibleTimeline.length === 0 && uploadDayOnly && !incompleteOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className={cn(gallerySans(), "text-sm text-muted-foreground")}>
            No upload-day capture dates left — Memories already has real days.
          </p>
          <button
            type="button"
            className={cn(
              gallerySans(),
              "text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            )}
            onClick={() => {
              setIncompleteOnly(false)
              setUploadDayOnly(false)
            }}
          >
            Clear filters
          </button>
        </div>
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
              takenAtAvailable={takenAtAvailable}
              tagsAvailable={tagsAvailable}
              pinAvailable={pinAvailable}
            />
          )
        }

        return (
          <ul
            key={entry.row.id}
            className="flex flex-col gap-3"
            role={selectionMode ? "listbox" : undefined}
            aria-multiselectable={selectionMode ? true : undefined}
            aria-label={selectionMode ? "Select works" : undefined}
          >
            <UploadListItem
              image={entry.row}
              siblings={images}
              selected={selectedIds.has(entry.row.id)}
              onToggleSelected={(options) =>
                toggleSelected(entry.row.id, options)
              }
              selectionMode={selectionMode}
              isAdmin={isAdmin}
              showWallPin={pinAvailable}
              takenAtAvailable={takenAtAvailable}
              tagsAvailable={tagsAvailable}
            />
          </ul>
        )
      })}

      <AlbumSlideshow
        photos={slideshowDeck}
        albumTitle={slideshowTitle}
        open={slideshowOpen}
        onOpenChange={handleSlideshowOpenChange}
        startIndex={0}
      />

      <Dialog
        open={bulkDateOpen}
        onOpenChange={handleBulkDialogOpenChange(setBulkDateOpen)}
      >
        <DialogContent className="gap-6" aria-busy={isPending || undefined}>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl italic">
              Set capture date
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              className={cn(gallerySans(), "text-sm text-muted-foreground")}
              htmlFor="bulk-taken-at-date"
            >
              Apply one Asia/Taipei day to {selectedItems.length} selected work
              {selectedItems.length === 1 ? "" : "s"} (for Memories).
            </label>
            <Input
              id="bulk-taken-at-date"
              type="date"
              value={bulkDateDraft}
              onChange={(e) => setBulkDateDraft(e.target.value)}
              disabled={isPending}
              className="text-base"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDateOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmBulkDate}
              disabled={isPending}
              aria-busy={isPending || undefined}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkTagOpen}
        onOpenChange={handleBulkDialogOpenChange(setBulkTagOpen)}
      >
        <DialogContent className="gap-6" aria-busy={isPending || undefined}>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl italic">
              Tag selected
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              className={cn(gallerySans(), "text-sm text-muted-foreground")}
              htmlFor="bulk-manage-tag"
            >
              Apply one tag to {selectedItems.length} selected work
              {selectedItems.length === 1 ? "" : "s"}.
            </label>
            <Input
              id="bulk-manage-tag"
              value={bulkTagDraft}
              onChange={(e) => setBulkTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirmBulkTag()
                }
              }}
              disabled={isPending}
              placeholder="retreat, axolotl…"
              className="text-base"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkTagOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmBulkTag}
              disabled={isPending}
              aria-busy={isPending || undefined}
            >
              {isPending ? "Tagging…" : "Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkUntagOpen}
        onOpenChange={handleBulkDialogOpenChange(setBulkUntagOpen)}
      >
        <DialogContent className="gap-6" aria-busy={isPending || undefined}>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl italic">
              Untag selected
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              className={cn(gallerySans(), "text-sm text-muted-foreground")}
              htmlFor="bulk-manage-untag"
            >
              Remove this tag slug from {selectedItems.length} selected work
              {selectedItems.length === 1 ? "" : "s"}.
            </label>
            <Input
              id="bulk-manage-untag"
              value={bulkUntagDraft}
              onChange={(e) => setBulkUntagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  confirmBulkUntag()
                }
              }}
              disabled={isPending}
              placeholder="slug…"
              className="text-base"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkUntagOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmBulkUntag}
              disabled={isPending}
              aria-busy={isPending || undefined}
            >
              {isPending ? "Untagging…" : "Untag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkAlbumOpen}
        onOpenChange={handleBulkDialogOpenChange(setBulkAlbumOpen)}
      >
        <DialogContent className="gap-6" aria-busy={isPending || undefined}>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl italic">
              New album
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <label
              className={cn(gallerySans(), "text-sm text-muted-foreground")}
              htmlFor="bulk-manage-album"
            >
              Create an album with {selectedItems.length} selected work
              {selectedItems.length === 1 ? "" : "s"}.
            </label>
            <Input
              id="bulk-manage-album"
              value={bulkAlbumDraft}
              onChange={(e) => setBulkAlbumDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  createAlbumFromSelection()
                }
              }}
              placeholder="Album title…"
              disabled={isPending}
              className="text-base"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkAlbumOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createAlbumFromSelection}
              disabled={isPending || !bulkAlbumDraft.trim()}
              aria-busy={isPending || undefined}
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={handleBulkDialogOpenChange(setConfirmOpen)}
      >
        <AlertDialogContent aria-busy={isPending || undefined}>
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
            <AlertDialogCancel disabled={isPending}>
              Keep them
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              aria-busy={isPending || undefined}
              onClick={confirmBatchDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? "Deleting…" : "Delete forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
