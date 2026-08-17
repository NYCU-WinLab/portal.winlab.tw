import type { GalleryImage } from "@/lib/gallery/types"

export type WallSelectionZipItem = {
  name: string
  image_path: string
  position: number
}

/**
 * Flatten selected wall covers into ZIP sources. Multi-shot sequences expand
 * to every sibling (story order); singles stay one entry.
 */
export function expandWallSelectionZipItems(
  orderedSelectedIds: string[],
  images: Pick<
    GalleryImage,
    "id" | "name" | "image_path" | "sequence_items" | "sequence_count"
  >[]
): WallSelectionZipItem[] {
  const byId = new Map(images.map((image) => [image.id, image]))
  const items: WallSelectionZipItem[] = []
  let position = 0

  for (const id of orderedSelectedIds) {
    const image = byId.get(id)
    if (!image) continue

    const siblings =
      image.sequence_count > 1 && image.sequence_items.length > 0
        ? image.sequence_items
        : null

    if (siblings) {
      for (const shot of siblings) {
        if (!shot.image_path) continue
        items.push({
          name: shot.name,
          image_path: shot.image_path,
          position,
        })
        position += 1
      }
      continue
    }

    if (!image.image_path) continue
    items.push({
      name: image.name,
      image_path: image.image_path,
      position,
    })
    position += 1
  }

  return items
}
