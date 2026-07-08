"use client"

import {
  useMemo,
  useState,
  useTransition,
  type DragEvent,
  type ReactNode,
} from "react"
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

import {
  deleteGalleryImages,
  updateGallerySequenceOrder,
} from "@/app/upload/actions"
import { DeleteButton } from "@/app/upload/_components/delete-button"
import { RenameButton } from "@/app/upload/_components/rename-button"
import { UploadListThumb } from "@/app/upload/_components/upload-list-thumb"
import { ViewOnWallLink } from "@/app/upload/_components/view-on-wall-link"
import { PinWallButton } from "@/app/_components/pin-wall-button"
import {
  galleryPanelClass,
  galleryPillClass,
  gallerySans,
  gallerySectionTitleClass,
} from "@/components/gallery-chrome"
import {
  groupManageUploads,
  swapSequenceOrder,
  type ManageUploadRow,
} from "@/lib/gallery/manage-uploads"
import { resolveWallPhotoId } from "@/lib/gallery/wall-photo-id"
import { getGalleryImageUrl } from "@/lib/gallery/url"

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
  draggableProps,
}: {
  image: ManageUploadRow
  siblings: ManageUploadRow[]
  sequenceControls?: ReactNode
  selected: boolean
  onToggleSelected: () => void
  selectionMode: boolean
  isAdmin?: boolean
  showWallPin?: boolean
  draggableProps?: {
    draggable: boolean
    onDragStart: (event: DragEvent<HTMLLIElement>) => void
    onDragOver: (event: DragEvent<HTMLLIElement>) => void
    onDrop: (event: DragEvent<HTMLLIElement>) => void
  }
}) {
  const isVideo = image.media_type === "video"
  const thumbPath =
    isVideo && image.poster_path ? image.poster_path : image.image_path
  const wallPhotoId = resolveWallPhotoId(image, siblings)

  return (
    <li
      {...draggableProps}
      className={cn(
        galleryPanelClass(),
        "flex items-center gap-4 !p-4 sm:gap-5",
        draggableProps?.draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
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
        src={getGalleryImageUrl(thumbPath)}
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
          {new Date(image.created_at).toLocaleDateString(undefined, {
            dateStyle: "medium",
          })}
          {isVideo && image.duration_seconds
            ? ` · ${image.duration_seconds}s video`
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
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const orderedIds = useMemo(() => items.map((item) => item.id), [items])

  const persistOrder = (nextIds: string[], nextItems: ManageUploadRow[]) => {
    setItems(nextItems)
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
    if (index === 0) return
    const nextIds = swapSequenceOrder(orderedIds, index, 0)
    if (!nextIds) return
    const nextItems = nextIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is ManageUploadRow => Boolean(item))
    persistOrder(nextIds, nextItems)
  }

  const onDropAt = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) return
    move(dragIndex, targetIndex)
    setDragIndex(null)
  }

  return (
    <div className="space-y-3">
      <p
        className={cn(gallerySans(), "text-xs text-muted-foreground uppercase")}
      >
        Sequence · {items.length} shots · drag to reorder
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((image, index) => (
          <UploadListItem
            key={image.id}
            image={image}
            siblings={allImages}
            selected={selectedIds.has(image.id)}
            onToggleSelected={() => onToggleSelected(image.id)}
            selectionMode={selectionMode}
            isAdmin={isAdmin}
            showWallPin={index === 0}
            draggableProps={{
              draggable: !isPending,
              onDragStart: () => setDragIndex(index),
              onDragOver: (event) => event.preventDefault(),
              onDrop: () => onDropAt(index),
            }}
            sequenceControls={
              <>
                {index === 0 ? (
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
        ))}
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
    () => new Intl.Collator(undefined, { sensitivity: "base", numeric: true }),
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
        {selectionMode && selectedItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isPending}
            className={cn(galleryPillClass(), "text-destructive")}
          >
            Delete selected ({selectedItems.length})
          </button>
        ) : null}
      </div>

      {timeline.map((entry) => {
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
          <ul
            key={entry.row.id}
            className="flex flex-col gap-3"
          >
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
              Delete {selectedItems.length} selected work
              {selectedItems.length === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the selected works from the gallery and storage.
              Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBatchDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
