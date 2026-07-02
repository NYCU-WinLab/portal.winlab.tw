export type GalleryMediaFilter = "all" | "image" | "video"

export type GalleryHomeFilters = {
  uploaderId: string | null
  media: GalleryMediaFilter
  uploadedAfter: string | null
}

export const EMPTY_GALLERY_HOME_FILTERS: GalleryHomeFilters = {
  uploaderId: null,
  media: "all",
  uploadedAfter: null,
}

export function parseGalleryHomeFilters(params: {
  uploader?: string
  media?: string
  after?: string
}): GalleryHomeFilters {
  const media =
    params.media === "image" || params.media === "video" ? params.media : "all"
  const uploaderId = params.uploader?.trim() || null
  const uploadedAfter = params.after?.trim() || null
  return { uploaderId, media, uploadedAfter }
}

export function hasActiveGalleryFilters(filters: GalleryHomeFilters): boolean {
  return (
    filters.uploaderId !== null ||
    filters.media !== "all" ||
    filters.uploadedAfter !== null
  )
}

export function buildGalleryHomeHref({
  page,
  photoId,
  commentId,
  filters,
}: {
  page?: number
  photoId?: string | null
  commentId?: string | null
  filters?: GalleryHomeFilters
}): string {
  const params = new URLSearchParams()
  if (page && page > 1) params.set("page", String(page))
  if (filters?.uploaderId) params.set("uploader", filters.uploaderId)
  if (filters?.media && filters.media !== "all") {
    params.set("media", filters.media)
  }
  if (filters?.uploadedAfter) params.set("after", filters.uploadedAfter)
  if (photoId) params.set("photo", photoId)
  if (commentId) params.set("comment", commentId)
  const qs = params.toString()
  return qs ? `/?${qs}` : "/"
}
