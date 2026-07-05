export type GalleryMediaFilter = "all" | "image" | "video"

export type GalleryHomeFilters = {
  uploaderId: string | null
  media: GalleryMediaFilter
  uploadedAfter: string | null
  query: string | null
}

export const EMPTY_GALLERY_HOME_FILTERS: GalleryHomeFilters = {
  uploaderId: null,
  media: "all",
  uploadedAfter: null,
  query: null,
}

export function parseGalleryHomeFilters(params: {
  uploader?: string
  media?: string
  after?: string
  q?: string
}): GalleryHomeFilters {
  const media =
    params.media === "image" || params.media === "video" ? params.media : "all"
  const uploaderId = params.uploader?.trim() || null
  const uploadedAfter = params.after?.trim() || null
  const query = params.q?.trim() || null
  return { uploaderId, media, uploadedAfter, query }
}

export function hasActiveGalleryFilters(filters: GalleryHomeFilters): boolean {
  return (
    filters.uploaderId !== null ||
    filters.media !== "all" ||
    filters.uploadedAfter !== null ||
    filters.query !== null
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
  if (filters?.query) params.set("q", filters.query)
  if (photoId) params.set("photo", photoId)
  if (commentId) params.set("comment", commentId)
  const qs = params.toString()
  return qs ? `/?${qs}` : "/"
}

const MEDIA_LABELS: Record<GalleryMediaFilter, string> = {
  all: "All media",
  image: "Photos",
  video: "Videos",
}

function dateLabelFromAfter(after: string | null): string | null {
  if (!after) return null
  const target = new Date(after).getTime()
  if (!Number.isFinite(target)) return null
  const now = Date.now()
  const days = Math.round((now - target) / 86_400_000)
  if (days <= 8) return "This week"
  if (days <= 31) return "This month"
  if (days <= 366) return "This year"
  return "Custom date"
}

export function describeGalleryFilterSummary(
  filters: GalleryHomeFilters,
  members: { id: string; name: string | null; email: string | null }[]
): string[] {
  const parts: string[] = []
  if (filters.uploaderId) {
    const member = members.find((item) => item.id === filters.uploaderId)
    parts.push(member?.name ?? member?.email ?? "Member")
  }
  if (filters.media !== "all") {
    parts.push(MEDIA_LABELS[filters.media])
  }
  const dateLabel = dateLabelFromAfter(filters.uploadedAfter)
  if (dateLabel) parts.push(dateLabel)
  if (filters.query) parts.push(`"${filters.query}"`)
  return parts
}
