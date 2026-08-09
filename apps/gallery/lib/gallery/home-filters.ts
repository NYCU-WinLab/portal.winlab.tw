export type GalleryMediaFilter = "all" | "image" | "video"

export type GalleryHomeFilters = {
  uploaderId: string | null
  media: GalleryMediaFilter
  uploadedAfter: string | null
  query: string | null
  tagSlug: string | null
  /** Signed-in only: wall covers for the viewer's saved favorites. */
  savedOnly: boolean
}

export const EMPTY_GALLERY_HOME_FILTERS: GalleryHomeFilters = {
  uploaderId: null,
  media: "all",
  uploadedAfter: null,
  query: null,
  tagSlug: null,
  savedOnly: false,
}

export function parseGalleryHomeFilters(params: {
  uploader?: string
  media?: string
  after?: string
  q?: string
  tag?: string
  saved?: string
}): GalleryHomeFilters {
  const media =
    params.media === "image" || params.media === "video" ? params.media : "all"
  const uploaderId = params.uploader?.trim() || null
  const uploadedAfter = params.after?.trim() || null
  const query = params.q?.trim() || null
  const tagRaw = params.tag?.trim().toLowerCase() || null
  const tagSlug =
    tagRaw && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tagRaw) ? tagRaw : null
  const savedRaw = params.saved?.trim().toLowerCase()
  const savedOnly = savedRaw === "1" || savedRaw === "true"
  return { uploaderId, media, uploadedAfter, query, tagSlug, savedOnly }
}

export function hasActiveGalleryFilters(filters: GalleryHomeFilters): boolean {
  return (
    filters.uploaderId !== null ||
    filters.media !== "all" ||
    filters.uploadedAfter !== null ||
    filters.query !== null ||
    filters.tagSlug !== null ||
    filters.savedOnly
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
  if (filters?.tagSlug) params.set("tag", filters.tagSlug)
  if (filters?.savedOnly) params.set("saved", "1")
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
  members: { id: string; name: string | null; email: string | null }[],
  tagLabel?: string | null
): string[] {
  const parts: string[] = []
  if (filters.savedOnly) parts.push("Saved")
  if (filters.tagSlug) {
    parts.push(tagLabel?.trim() || `#${filters.tagSlug}`)
  }
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
