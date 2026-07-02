"use client"

import { useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { cn } from "@workspace/ui/lib/utils"

import { updateGallerySequenceOrder } from "@/app/upload/actions"
import { DeleteButton } from "@/app/upload/_components/delete-button"
import { RenameButton } from "@/app/upload/_components/rename-button"
import { UploadListThumb } from "@/app/upload/_components/upload-list-thumb"
import { ViewOnWallLink } from "@/app/upload/_components/view-on-wall-link"
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

function UploadListItem({
  image,
  siblings,
  sequenceControls,
}: {
  image: ManageUploadRow
  siblings: ManageUploadRow[]
  sequenceControls?: ReactNode
}) {
  const isVideo = image.media_type === "video"
  const thumbPath =
    isVideo && image.poster_path ? image.poster_path : image.image_path
  const wallPhotoId = resolveWallPhotoId(image, siblings)

  return (
    <li
      className={cn(
        galleryPanelClass(),
        "flex items-center gap-4 !p-4 sm:gap-5"
      )}
    >
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
}: {
  sequenceId: string
  items: ManageUploadRow[]
  allImages: ManageUploadRow[]
}) {
  const [items, setItems] = useState(initialItems)
  const [isPending, startTransition] = useTransition()
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

  return (
    <div className="space-y-3">
      <p
        className={cn(gallerySans(), "text-xs text-muted-foreground uppercase")}
      >
        Sequence · {items.length} shots
      </p>
      <ul className="flex flex-col gap-3">
        {items.map((image, index) => (
          <UploadListItem
            key={image.id}
            image={image}
            siblings={allImages}
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

export function UploadManageList({ images }: { images: ManageUploadRow[] }) {
  const { singles, sequences } = useMemo(
    () => groupManageUploads(images),
    [images]
  )

  if (images.length === 0) return null

  return (
    <div className="flex flex-col gap-6">
      {sequences.map((sequence) => (
        <UploadSequenceGroup
          key={sequence.sequenceId}
          sequenceId={sequence.sequenceId}
          items={sequence.items}
          allImages={images}
        />
      ))}
      {singles.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {singles.map((image) => (
            <UploadListItem key={image.id} image={image} siblings={images} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}
