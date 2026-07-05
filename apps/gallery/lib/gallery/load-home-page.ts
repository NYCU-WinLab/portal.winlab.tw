import type { SupabaseClient } from "@supabase/supabase-js"

import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  aggregateReactions,
  isGalleryReaction,
} from "@/lib/gallery/reactions"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export const GALLERY_PAGE_SIZE = 36

type ProfileRow = {
  id: string
  name: string | null
  email: string | null
}

type CoverRow = {
  id: string
  name: string
  image_path: string
  media_type: string | null
  poster_path: string | null
  duration_seconds: number | null
  created_by: string
  created_at: string
  pinned_at: string | null
  sequence_id: string | null
  sequence_index: number | null
}

function buildNameById(rows: ProfileRow[]): Map<string, string> {
  return rows.reduce((map, row) => {
    const fallback =
      typeof row.email === "string" ? row.email.split("@")[0] : null
    const name =
      (typeof row.name === "string" && row.name.trim()) || fallback || "Unknown"
    map.set(row.id, name)
    return map
  }, new Map<string, string>())
}

function buildMembers(rows: ProfileRow[]): GalleryMember[] {
  return rows.filter(
    (row) => typeof row.name === "string" && row.name.trim().length > 0
  )
}

function buildCommentCountByImage(
  rows: { image_id: string }[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.image_id, (counts.get(row.image_id) ?? 0) + 1)
  }
  return counts
}

export async function loadGalleryHomePage(
  supabase: SupabaseClient,
  {
    page,
    userId,
    filters = { uploaderId: null, media: "all", uploadedAfter: null },
  }: {
    page: number
    userId: string | null
    filters?: GalleryHomeFilters
  }
): Promise<{
  images: GalleryImage[]
  members: GalleryMember[]
  totalPages: number
  currentPage: number
}> {
  const currentPage = Number.isFinite(page) && page > 0 ? page : 1
  const from = (currentPage - 1) * GALLERY_PAGE_SIZE
  const to = from + GALLERY_PAGE_SIZE - 1

  const [profilesResult, imagesResult] = await Promise.all([
    userId
      ? supabase
          .from("user_profiles")
          .select("id, name, email")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    (() => {
      let query = supabase
        .from("gallery_images")
        .select(
          "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at, pinned_at, sequence_id, sequence_index",
          { count: "exact" }
        )
        .or("sequence_id.is.null,sequence_index.eq.0")

      if (filters.uploaderId) {
        query = query.eq("created_by", filters.uploaderId)
      }
      if (filters.media === "image" || filters.media === "video") {
        query = query.eq("media_type", filters.media)
      }
      if (filters.uploadedAfter) {
        query = query.gte("created_at", filters.uploadedAfter)
      }

      return query
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    })(),
  ])

  if (imagesResult.error) {
    console.error("[gallery] failed to load images", imagesResult.error)
  }
  if (profilesResult.error) {
    console.error(
      "[gallery] failed to load member profiles",
      profilesResult.error
    )
  }

  const coverRows = (imagesResult.data ?? []) as CoverRow[]
  const sequenceIds = Array.from(
    new Set(
      coverRows
        .map((image) => image.sequence_id)
        .filter((id): id is string => typeof id === "string")
    )
  )

  const sequenceRowsById = new Map<string, CoverRow[]>()
  if (sequenceIds.length > 0) {
    const { data: sequenceRows, error: sequenceError } = await supabase
      .from("gallery_images")
      .select(
        "id, name, image_path, media_type, poster_path, duration_seconds, created_by, created_at, sequence_id, sequence_index"
      )
      .in("sequence_id", sequenceIds)
      .order("sequence_index", { ascending: true })
      .order("created_at", { ascending: true })

    if (sequenceError) {
      console.error("[gallery] failed to load sequence rows", sequenceError)
    } else {
      for (const row of (sequenceRows ?? []) as CoverRow[]) {
        const sequenceId = row.sequence_id
        if (!sequenceId) continue
        const bucket = sequenceRowsById.get(sequenceId) ?? []
        bucket.push(row)
        sequenceRowsById.set(sequenceId, bucket)
      }
    }
  }

  const imageIds = coverRows.map((image) => image.id)
  let countsByImage = new Map<string, typeof EMPTY_REACTION_COUNTS>()
  let namesByImage = new Map<string, typeof EMPTY_REACTION_NAMES>()
  const myReactionByImage = new Map<string, GalleryImage["my_reaction"]>()
  let commentCountByImage = new Map<string, number>()
  let nameById = buildNameById((profilesResult.data ?? []) as ProfileRow[])

  if (imageIds.length > 0) {
    const [voteResult, commentCountResult] = await Promise.all([
      supabase
        .from("gallery_image_votes")
        .select("image_id, user_id, reaction")
        .in("image_id", imageIds),
      supabase
        .from("gallery_comments")
        .select("image_id")
        .in("image_id", imageIds),
    ])

    if (voteResult.error) {
      console.error("[gallery] failed to load reactions", voteResult.error)
    }
    if (commentCountResult.error) {
      console.error(
        "[gallery] failed to load comment counts",
        commentCountResult.error
      )
    }

    const voteRows = voteResult.data ?? []
    commentCountByImage = buildCommentCountByImage(
      (commentCountResult.data ?? []) as { image_id: string }[]
    )

    if (!userId) {
      const profileIds = Array.from(
        new Set([
          ...coverRows.map((image) => image.created_by).filter(Boolean),
          ...voteRows.map((row) => row.user_id).filter(Boolean),
        ])
      ) as string[]

      if (profileIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("user_profiles")
          .select("id, name, email")
          .in("id", profileIds)

        if (profileError) {
          console.error(
            "[gallery] failed to load display profiles",
            profileError
          )
        } else {
          nameById = buildNameById((profileRows ?? []) as ProfileRow[])
        }
      }
    }

    const aggregated = aggregateReactions(voteRows, nameById)
    countsByImage = aggregated.countsByImage
    namesByImage = aggregated.namesByImage

    if (userId) {
      for (const row of voteRows) {
        if (row.user_id === userId && isGalleryReaction(row.reaction)) {
          myReactionByImage.set(row.image_id, row.reaction)
        }
      }
    }
  }

  const members = userId
    ? buildMembers((profilesResult.data ?? []) as ProfileRow[])
    : []

  const images: GalleryImage[] = coverRows.map((image) => ({
    id: image.id,
    name: image.name,
    image_path: image.image_path,
    media_type: image.media_type === "video" ? "video" : "image",
    poster_path: image.poster_path ?? null,
    duration_seconds: image.duration_seconds ?? null,
    created_by: image.created_by,
    created_at: image.created_at,
    pinned_at: image.pinned_at ?? null,
    sequence_id: image.sequence_id ?? null,
    sequence_index:
      typeof image.sequence_index === "number" ? image.sequence_index : null,
    sequence_count: 1,
    sequence_items: [],
    comments: [],
    comment_count: commentCountByImage.get(image.id) ?? 0,
    uploader_name: image.created_by
      ? (nameById.get(image.created_by) ?? "Unknown")
      : "Unknown",
    reaction_counts: countsByImage.get(image.id) ?? EMPTY_REACTION_COUNTS,
    my_reaction: myReactionByImage.get(image.id) ?? null,
    reaction_names: namesByImage.get(image.id) ?? EMPTY_REACTION_NAMES,
  }))

  for (const image of images) {
    if (!image.sequence_id) continue
    const items = sequenceRowsById.get(image.sequence_id) ?? []
    if (items.length <= 1) continue
    image.sequence_count = items.length
    image.sequence_items = items.map((item) => ({
      id: item.id,
      name: item.name,
      image_path: item.image_path,
      media_type: item.media_type === "video" ? "video" : "image",
      poster_path: item.poster_path ?? null,
      created_at: item.created_at,
    }))
  }

  const totalPages = Math.max(
    1,
    Math.ceil((imagesResult.count ?? 0) / GALLERY_PAGE_SIZE)
  )

  return { images, members, totalPages, currentPage }
}

export async function loadGalleryHomePages(
  supabase: SupabaseClient,
  {
    throughPage,
    userId,
    filters = {
      uploaderId: null,
      media: "all",
      uploadedAfter: null,
      query: null,
    },
  }: {
    throughPage: number
    userId: string | null
    filters?: GalleryHomeFilters
  }
): Promise<{
  images: GalleryImage[]
  members: GalleryMember[]
  totalPages: number
  currentPage: number
  hasMore: boolean
}> {
  const targetPage = Math.max(1, throughPage)
  const first = await loadGalleryHomePage(supabase, {
    page: 1,
    userId,
    filters,
  })

  if (targetPage === 1) {
    return {
      ...first,
      hasMore: first.currentPage < first.totalPages,
    }
  }

  const extraPages = await Promise.all(
    Array.from({ length: targetPage - 1 }, (_, index) =>
      loadGalleryHomePage(supabase, {
        page: index + 2,
        userId,
        filters,
      })
    )
  )

  const seen = new Set<string>()
  const images: GalleryImage[] = []
  for (const batch of [first, ...extraPages]) {
    for (const image of batch.images) {
      if (seen.has(image.id)) continue
      seen.add(image.id)
      images.push(image)
    }
  }

  return {
    images,
    members: first.members,
    totalPages: first.totalPages,
    currentPage: targetPage,
    hasMore: targetPage < first.totalPages,
  }
}
