import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js"

import { isGalleryAlbumsUnavailable } from "@/lib/gallery/albums"
import { isGalleryCommentsUnavailable } from "@/lib/gallery/comment-edit"
import {
  isGalleryFavoritesUnavailable,
  loadFavoritedImageIds,
} from "@/lib/gallery/favorites"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"
import {
  findSequenceGaps,
  isGalleryPinnedAtUnavailable,
  isGallerySequenceUnavailable,
  isGalleryVideoColumnsUnavailable,
} from "@/lib/gallery/manage-uploads"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  aggregateReactions,
  isGalleryReaction,
  isGalleryReactionsUnavailable,
  normalizeReactionCounts,
  normalizeReactionNames,
} from "@/lib/gallery/reactions"
import { isGalleryTagsUnavailable, type GalleryTag } from "@/lib/gallery/tags"
import type { GalleryImage, GalleryMember } from "@/lib/gallery/types"

export const GALLERY_PAGE_SIZE = 36

const COVER_COLUMNS_MINIMAL = "id, name, image_path, created_by, created_at"
const COVER_COLUMNS_WITH_SEQ = `${COVER_COLUMNS_MINIMAL}, sequence_id, sequence_index`
const COVER_COLUMNS_CORE = `${COVER_COLUMNS_WITH_SEQ}, media_type, poster_path, duration_seconds`
const COVER_COLUMNS = `${COVER_COLUMNS_CORE}, pinned_at`

// gallery_wall_page = gallery_wall_covers + reaction/comment aggregates.
const WALL_PAGE_COLUMNS = `${COVER_COLUMNS}, uploader_name, reaction_counts, reaction_names, my_reaction, comment_count`

type ProfileRow = {
  id: string
  name: string | null
  email?: string | null
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

type WallPageRow = CoverRow & {
  uploader_name: string | null
  reaction_counts: unknown
  reaction_names: unknown
  my_reaction: string | null
  comment_count: number | null
}

// Non-recursive shape of the query-builder methods we chain here. Kept flat
// (methods return WallFilterable, not the self-type) so TS doesn't try to
// re-instantiate the full PostgREST builder generic against itself.
type WallFilterable = {
  eq(column: string, value: string): WallFilterable
  gte(column: string, value: string): WallFilterable
  ilike(column: string, value: string): WallFilterable
}

export type { WallFilterable }

/**
 * Apply the shared wall filters (uploader / media / after / query). Typed
 * against the flat WallFilterable shape so TS never re-instantiates the full
 * PostgREST builder generic; callers cast the result back to their builder.
 */
export function applyWallFilters(
  query: WallFilterable,
  filters: GalleryHomeFilters,
  options: { skipQuery?: boolean } = {}
): WallFilterable {
  let next = query
  if (filters.uploaderId) {
    next = next.eq("created_by", filters.uploaderId)
  }
  if (filters.media === "image" || filters.media === "video") {
    next = next.eq("media_type", filters.media)
  }
  if (filters.uploadedAfter) {
    next = next.gte("created_at", filters.uploadedAfter)
  }
  if (filters.query && !options.skipQuery) {
    next = next.ilike("name", `%${filters.query}%`)
  }
  return next
}

// Unconstrained passthrough: keeps the caller's builder type while routing the
// value through applyWallFilters. The unknown casts stop TS from structurally
// comparing the (deeply recursive) PostgREST builder against WallFilterable.
function withWallFilters<T>(
  query: T,
  filters: GalleryHomeFilters,
  options: { skipQuery?: boolean } = {}
): T {
  return applyWallFilters(
    query as unknown as WallFilterable,
    filters,
    options
  ) as unknown as T
}

/** Missing relation (42P01) — the aggregate view has not been applied yet. */
function isMissingWallPageView(error: PostgrestError | null): boolean {
  if (!error) return false
  return (
    error.code === "42P01" ||
    /gallery_wall_page/i.test(error.message) ||
    /does not exist/i.test(error.message)
  )
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
  return rows
    .filter((row) => typeof row.name === "string" && row.name.trim().length > 0)
    .map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email ?? null,
    }))
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

type ImageTagJoinRow = {
  image_id: string
  gallery_tags:
    | { id: string; name: string; slug: string }
    | { id: string; name: string; slug: string }[]
    | null
}

function buildTagsByImage(rows: ImageTagJoinRow[]): Map<string, GalleryTag[]> {
  const map = new Map<string, GalleryTag[]>()
  for (const row of rows) {
    const tagValue = row.gallery_tags
    const tag = Array.isArray(tagValue) ? tagValue[0] : tagValue
    if (!tag?.id || !tag.slug) continue
    const bucket = map.get(row.image_id) ?? []
    if (bucket.some((item) => item.id === tag.id)) continue
    bucket.push({ id: tag.id, name: tag.name, slug: tag.slug })
    map.set(row.image_id, bucket)
  }
  for (const [imageId, tags] of map) {
    map.set(
      imageId,
      [...tags].sort((a, b) => a.name.localeCompare(b.name))
    )
  }
  return map
}

async function loadTagsByImageIds(
  supabase: SupabaseClient,
  imageIds: string[]
): Promise<Map<string, GalleryTag[]>> {
  if (imageIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from("gallery_image_tags")
    .select("image_id, gallery_tags(id, name, slug)")
    .in("image_id", imageIds)
  if (error) {
    // Missing migration / schema cache — keep the wall up without an overlay.
    if (isGalleryTagsUnavailable(error)) return new Map()
    console.error("[gallery] failed to load tags", error)
    return new Map()
  }
  return buildTagsByImage((data ?? []) as ImageTagJoinRow[])
}

async function resolveTagCoverIds(
  supabase: SupabaseClient,
  tagSlug: string | null
): Promise<"none" | string[] | null> {
  if (!tagSlug) return null
  const { data: coverIdRows, error: tagCoverError } = await supabase.rpc(
    "gallery_wall_cover_ids_for_tag",
    { p_tag_slug: tagSlug }
  )
  if (tagCoverError) {
    // No RPC yet / transient failure → empty tag result (not the full wall).
    if (!isGalleryTagsUnavailable(tagCoverError)) {
      console.error("[gallery] failed to resolve tag covers", tagCoverError)
    }
    return "none"
  }
  const tagCoverIds = ((coverIdRows ?? []) as string[]).filter(Boolean)
  if (tagCoverIds.length === 0) return "none"
  return tagCoverIds
}

/**
 * Title + tag search via RPC. Returns:
 * - null: no query
 * - "legacy": RPC missing → caller should fall back to name ILIKE
 * - "none": no matching covers
 * - string[]: cover ids
 */
async function resolveQueryCoverIds(
  supabase: SupabaseClient,
  query: string | null
): Promise<"none" | "legacy" | string[] | null> {
  if (!query) return null
  const { data: coverIdRows, error } = await supabase.rpc(
    "gallery_wall_cover_ids_for_query",
    { p_query: query }
  )
  if (error) {
    if (
      isGalleryTagsUnavailable(error) ||
      /gallery_wall_cover_ids_for_query/i.test(error.message ?? "")
    ) {
      return "legacy"
    }
    // Keep the wall up with name ILIKE fallback on unexpected RPC errors.
    console.error("[gallery] failed to resolve search covers", error)
    return "legacy"
  }
  const ids = ((coverIdRows ?? []) as string[]).filter(Boolean)
  if (ids.length === 0) return "none"
  return ids
}

/**
 * Viewer's saved favorites as wall cover ids.
 * - null: filter not requested
 * - "none": no favorites / unsigned / RPC failure
 * - string[]: cover ids
 */
async function resolveFavoriteCoverIds(
  supabase: SupabaseClient,
  userId: string | null,
  savedOnly: boolean
): Promise<"none" | string[] | null> {
  if (!savedOnly) return null
  if (!userId) return "none"
  const { data: coverIdRows, error } = await supabase.rpc(
    "gallery_wall_cover_ids_for_favorites"
  )
  if (error) {
    if (!isGalleryFavoritesUnavailable(error)) {
      console.error("[gallery] failed to resolve favorite covers", error)
    }
    // Saved was requested — show empty rather than the unfiltered wall.
    return "none"
  }
  const ids = ((coverIdRows ?? []) as string[]).filter(Boolean)
  if (ids.length === 0) return "none"
  return ids
}

/**
 * Album membership as wall cover ids (sequence → cover).
 * - null: filter not requested
 * - "none": empty album / RPC failure / unknown slug
 * - string[]: cover ids
 */
async function resolveAlbumCoverIds(
  supabase: SupabaseClient,
  albumSlug: string | null
): Promise<"none" | string[] | null> {
  if (!albumSlug) return null
  const { data: coverIdRows, error } = await supabase.rpc(
    "gallery_wall_cover_ids_for_album",
    { p_slug: albumSlug }
  )
  if (error) {
    if (!isGalleryAlbumsUnavailable(error)) {
      console.error("[gallery] failed to resolve album covers", error)
    }
    // Album filter was requested — show empty rather than the unfiltered wall.
    return "none"
  }
  const ids = ((coverIdRows ?? []) as string[]).filter(Boolean)
  if (ids.length === 0) return "none"
  return ids
}

function applyFavoriteFlags(
  images: GalleryImage[],
  favoritedIds: Set<string>
): void {
  if (favoritedIds.size === 0) return
  for (const image of images) {
    const siblingIds = image.sequence_items.map((item) => item.id)
    image.is_favorited =
      favoritedIds.has(image.id) ||
      siblingIds.some((id) => favoritedIds.has(id))
  }
}

/** Intersect optional cover-id filters; "none" wins; null means unconstrained. */
export function intersectCoverIdFilters(
  ...filters: Array<"none" | string[] | null>
): "none" | string[] | null {
  let current: string[] | null = null
  for (const filter of filters) {
    if (filter === null) continue
    if (filter === "none") return "none"
    if (current === null) {
      current = filter
      continue
    }
    const allowed = new Set(filter)
    current = current.filter((id) => allowed.has(id))
    if (current.length === 0) return "none"
  }
  return current
}

/** Preserve caller order when hydrating rows fetched via `.in("id", …)`. */
export function orderRowsByIdList<T extends { id: string }>(
  rows: readonly T[],
  orderedIds: readonly string[]
): T[] {
  if (orderedIds.length === 0) return []
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered: T[] = []
  for (const id of orderedIds) {
    const row = byId.get(id)
    if (row) ordered.push(row)
  }
  return ordered
}

export function sliceCoverIdsForPage(
  orderedIds: readonly string[],
  from: number,
  to: number
): string[] {
  if (orderedIds.length === 0) return []
  const start = Math.max(0, from)
  const endExclusive = Math.max(start, to + 1)
  return orderedIds.slice(start, endExclusive)
}

function toGalleryImageBase(image: CoverRow): GalleryImage {
  return {
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
    sequence_missing_indexes: [],
    comments: [],
    comment_count: 0,
    tags: [],
    uploader_name: "Unknown",
    reaction_counts: EMPTY_REACTION_COUNTS,
    my_reaction: null,
    reaction_names: EMPTY_REACTION_NAMES,
  }
}

/**
 * Load the sibling rows of every sequence referenced by the cover rows, keyed
 * by sequence_id. Multi-item sequences need their members for the lightbox.
 */
async function loadSequenceRowsById(
  supabase: SupabaseClient,
  coverRows: Pick<CoverRow, "sequence_id">[]
): Promise<Map<string, CoverRow[]>> {
  const sequenceIds = Array.from(
    new Set(
      coverRows
        .map((image) => image.sequence_id)
        .filter((id): id is string => typeof id === "string")
    )
  )

  const sequenceRowsById = new Map<string, CoverRow[]>()
  if (sequenceIds.length === 0) return sequenceRowsById

  const { data: sequenceRows, error: sequenceError } = await supabase
    .from("gallery_images")
    .select(COVER_COLUMNS)
    .in("sequence_id", sequenceIds)
    .order("sequence_index", { ascending: true })
    .order("created_at", { ascending: true })

  let rows = sequenceRows
  if (sequenceError) {
    if (isGalleryPinnedAtUnavailable(sequenceError)) {
      const fallback = await supabase
        .from("gallery_images")
        .select(COVER_COLUMNS_CORE)
        .in("sequence_id", sequenceIds)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: true })
      if (fallback.error) {
        if (isGalleryVideoColumnsUnavailable(fallback.error)) {
          const noVideo = await supabase
            .from("gallery_images")
            .select(COVER_COLUMNS_WITH_SEQ)
            .in("sequence_id", sequenceIds)
            .order("sequence_index", { ascending: true })
            .order("created_at", { ascending: true })
          if (noVideo.error) {
            console.error(
              "[gallery] failed to load sequence rows",
              noVideo.error
            )
            return sequenceRowsById
          }
          rows = noVideo.data as unknown as typeof sequenceRows
        } else {
          console.error(
            "[gallery] failed to load sequence rows",
            fallback.error
          )
          return sequenceRowsById
        }
      } else {
        rows = fallback.data as unknown as typeof sequenceRows
      }
    } else if (isGalleryVideoColumnsUnavailable(sequenceError)) {
      const noVideo = await supabase
        .from("gallery_images")
        .select(`${COVER_COLUMNS_WITH_SEQ}, pinned_at`)
        .in("sequence_id", sequenceIds)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: true })
      if (noVideo.error) {
        console.error("[gallery] failed to load sequence rows", noVideo.error)
        return sequenceRowsById
      }
      rows = noVideo.data as unknown as typeof sequenceRows
    } else {
      console.error("[gallery] failed to load sequence rows", sequenceError)
      return sequenceRowsById
    }
  }

  for (const row of (rows ?? []) as CoverRow[]) {
    const sequenceId = row.sequence_id
    if (!sequenceId) continue
    const bucket = sequenceRowsById.get(sequenceId) ?? []
    bucket.push(row)
    sequenceRowsById.set(sequenceId, bucket)
  }
  return sequenceRowsById
}

/** Fill in sequence_count / sequence_items / gaps from the sibling rows. */
function expandSequences(
  images: GalleryImage[],
  sequenceRowsById: Map<string, CoverRow[]>,
  tagsByImage: Map<string, GalleryTag[]> = new Map()
): void {
  for (const image of images) {
    if (!image.sequence_id) continue
    const items = sequenceRowsById.get(image.sequence_id) ?? []
    if (items.length === 0) continue
    image.sequence_count = items.length
    image.sequence_missing_indexes = findSequenceGaps(
      items.map((item) => item.sequence_index)
    ).gaps
    if (items.length <= 1) continue
    image.sequence_items = items.map((item) => ({
      id: item.id,
      name: item.name,
      image_path: item.image_path,
      media_type: item.media_type === "video" ? "video" : "image",
      poster_path: item.poster_path ?? null,
      created_at: item.created_at,
      sequence_index:
        typeof item.sequence_index === "number" ? item.sequence_index : null,
      tags: tagsByImage.get(item.id) ?? [],
    }))
  }
}

type RangeResult = {
  images: GalleryImage[]
  members: GalleryMember[]
  totalCount: number
}

type RangeArgs = {
  from: number
  to: number
  userId: string | null
  filters: GalleryHomeFilters
}

/**
 * Fast path: one query against the gallery_wall_page view (covers + reaction
 * counts + reaction names + viewer reaction + comment count) plus a cheap
 * head-only count and, for signed-in viewers, the member roster. Reaction and
 * comment aggregation happens in Postgres, so the payload scales with covers,
 * not with engagement.
 */
async function loadGalleryHomeRangeViaView(
  supabase: SupabaseClient,
  { from, to, userId, filters }: RangeArgs
): Promise<RangeResult | null> {
  const [tagCoverIds, queryCoverIds, favoriteCoverIds, albumCoverIds] =
    await Promise.all([
      resolveTagCoverIds(supabase, filters.tagSlug),
      resolveQueryCoverIds(supabase, filters.query),
      resolveFavoriteCoverIds(supabase, userId, filters.savedOnly),
      resolveAlbumCoverIds(supabase, filters.albumSlug),
    ])
  const skipQueryIlike = queryCoverIds !== null && queryCoverIds !== "legacy"
  // Prefer search-RPC order so title matches page ahead of tag-only hits.
  const coverIdFilter = intersectCoverIdFilters(
    queryCoverIds === "legacy" ? null : queryCoverIds,
    tagCoverIds,
    favoriteCoverIds,
    albumCoverIds
  )
  const rankedSearchPaging =
    skipQueryIlike && Array.isArray(coverIdFilter) && coverIdFilter.length > 0

  if (coverIdFilter === "none") {
    const members = userId
      ? buildMembers(
          ((
            await supabase
              .from("user_profiles")
              .select("id, name")
              .order("name", { ascending: true })
          ).data ?? []) as ProfileRow[]
        )
      : []
    return { images: [], members, totalCount: 0 }
  }

  const pageCoverIds = rankedSearchPaging
    ? sliceCoverIdsForPage(coverIdFilter, from, to)
    : null

  let rowsBase = supabase.from("gallery_wall_page").select(WALL_PAGE_COLUMNS)
  rowsBase = withWallFilters(rowsBase, filters, { skipQuery: skipQueryIlike })
  if (pageCoverIds) {
    if (pageCoverIds.length === 0) {
      const members = userId
        ? buildMembers(
            ((
              await supabase
                .from("user_profiles")
                .select("id, name")
                .order("name", { ascending: true })
            ).data ?? []) as ProfileRow[]
          )
        : []
      return {
        images: [],
        members,
        totalCount: coverIdFilter?.length ?? 0,
      }
    }
    rowsBase = rowsBase.in("id", pageCoverIds)
  } else if (coverIdFilter) {
    rowsBase = rowsBase.in("id", coverIdFilter)
  }
  const rowsQuery = pageCoverIds
    ? rowsBase
    : rowsBase
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to)

  let countBase = supabase
    .from("gallery_wall_covers")
    .select("id", { count: "exact", head: true })
  countBase = withWallFilters(countBase, filters, { skipQuery: skipQueryIlike })
  if (coverIdFilter) {
    countBase = countBase.in("id", coverIdFilter)
  }

  const [rowsResult, countResult, membersResult] = await Promise.all([
    rowsQuery,
    countBase,
    userId
      ? supabase
          .from("user_profiles")
          .select("id, name")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
  ])

  if (rowsResult.error) {
    if (isMissingWallPageView(rowsResult.error)) return null
    // View still references pinned_at — fall back to legacy covers query.
    if (isGalleryPinnedAtUnavailable(rowsResult.error)) return null
    if (isGalleryVideoColumnsUnavailable(rowsResult.error)) return null
    if (isGallerySequenceUnavailable(rowsResult.error)) return null
    console.error("[gallery] failed to load wall page", rowsResult.error)
    // Fall back to the legacy cover query instead of crashing the wall.
    return null
  }
  if (countResult.error) {
    console.error("[gallery] failed to count wall covers", countResult.error)
  }
  if (membersResult.error) {
    console.error("[gallery] failed to load members", membersResult.error)
  }

  const rows = orderRowsByIdList(
    (rowsResult.data ?? []) as WallPageRow[],
    pageCoverIds ??
      ((rowsResult.data ?? []) as WallPageRow[]).map((row) => row.id)
  )
  const sequenceRowsById = await loadSequenceRowsById(supabase, rows)
  const tagLookupIds = Array.from(
    new Set([
      ...rows.map((row) => row.id),
      ...Array.from(sequenceRowsById.values()).flatMap((seqRows) =>
        seqRows.map((row) => row.id)
      ),
    ])
  )
  const tagsByImage = await loadTagsByImageIds(supabase, tagLookupIds)

  const images: GalleryImage[] = rows.map((row) => {
    const base = toGalleryImageBase(row)
    base.uploader_name = row.uploader_name?.trim() || "Unknown"
    base.comment_count =
      typeof row.comment_count === "number" ? row.comment_count : 0
    base.reaction_counts = normalizeReactionCounts(row.reaction_counts)
    base.reaction_names = normalizeReactionNames(row.reaction_names)
    base.my_reaction =
      typeof row.my_reaction === "string" && isGalleryReaction(row.my_reaction)
        ? row.my_reaction
        : null
    base.tags = tagsByImage.get(row.id) ?? []
    return base
  })

  expandSequences(images, sequenceRowsById, tagsByImage)

  const favoritedIds = await loadFavoritedImageIds(
    supabase,
    userId,
    tagLookupIds
  )
  applyFavoriteFlags(images, favoritedIds)

  return {
    images,
    members: userId
      ? buildMembers((membersResult.data ?? []) as ProfileRow[])
      : [],
    totalCount: rankedSearchPaging
      ? (coverIdFilter?.length ?? 0)
      : (countResult.count ?? 0),
  }
}

/**
 * Fallback path (pre-migration): fetch covers, then every vote and comment row
 * for the page, and reduce them in JS. Kept so the wall keeps working before
 * the gallery_wall_page view is applied.
 */
async function loadGalleryHomeRangeLegacy(
  supabase: SupabaseClient,
  { from, to, userId, filters }: RangeArgs
): Promise<RangeResult> {
  const [tagCoverIds, queryCoverIds, favoriteCoverIds, albumCoverIds] =
    await Promise.all([
      resolveTagCoverIds(supabase, filters.tagSlug),
      resolveQueryCoverIds(supabase, filters.query),
      resolveFavoriteCoverIds(supabase, userId, filters.savedOnly),
      resolveAlbumCoverIds(supabase, filters.albumSlug),
    ])
  const skipQueryIlike = queryCoverIds !== null && queryCoverIds !== "legacy"
  const coverIdFilter = intersectCoverIdFilters(
    queryCoverIds === "legacy" ? null : queryCoverIds,
    tagCoverIds,
    favoriteCoverIds,
    albumCoverIds
  )
  const rankedSearchPaging =
    skipQueryIlike && Array.isArray(coverIdFilter) && coverIdFilter.length > 0

  if (coverIdFilter === "none") {
    const members = userId
      ? buildMembers(
          ((
            await supabase
              .from("user_profiles")
              .select("id, name")
              .order("name", { ascending: true })
          ).data ?? []) as ProfileRow[]
        )
      : []
    return { images: [], members, totalCount: 0 }
  }

  const pageCoverIds = rankedSearchPaging
    ? sliceCoverIdsForPage(coverIdFilter, from, to)
    : null

  const [profilesResult, imagesResultInitial] = await Promise.all([
    userId
      ? supabase
          .from("user_profiles")
          .select("id, name")
          .order("name", { ascending: true })
      : Promise.resolve({ data: [] as ProfileRow[], error: null }),
    (() => {
      let base = supabase
        .from("gallery_wall_covers")
        .select(COVER_COLUMNS, { count: "exact" })
      base = withWallFilters(base, filters, { skipQuery: skipQueryIlike })
      if (pageCoverIds) {
        if (pageCoverIds.length === 0) {
          return Promise.resolve({
            data: [] as CoverRow[],
            error: null,
            count: coverIdFilter?.length ?? 0,
          })
        }
        return base.in("id", pageCoverIds)
      }
      if (coverIdFilter) {
        base = base.in("id", coverIdFilter)
      }
      return base
        .order("pinned_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to)
    })(),
  ])

  let imagesResult: {
    data: CoverRow[] | null
    error: PostgrestError | null
    count?: number | null
  } = imagesResultInitial as {
    data: CoverRow[] | null
    error: PostgrestError | null
    count?: number | null
  }
  if (imagesResult.error && isGalleryPinnedAtUnavailable(imagesResult.error)) {
    imagesResult = (await (() => {
      let base = supabase
        .from("gallery_wall_covers")
        .select(COVER_COLUMNS_CORE, { count: "exact" })
      base = withWallFilters(base, filters, { skipQuery: skipQueryIlike })
      if (pageCoverIds) {
        if (pageCoverIds.length === 0) {
          return Promise.resolve({
            data: [] as CoverRow[],
            error: null,
            count: coverIdFilter?.length ?? 0,
          })
        }
        return base.in("id", pageCoverIds)
      }
      if (coverIdFilter) {
        base = base.in("id", coverIdFilter)
      }
      return base.order("created_at", { ascending: false }).range(from, to)
    })()) as {
      data: CoverRow[] | null
      error: PostgrestError | null
      count?: number | null
    }
  }

  if (
    imagesResult.error &&
    isGalleryVideoColumnsUnavailable(imagesResult.error)
  ) {
    imagesResult = (await (() => {
      let base = supabase
        .from("gallery_wall_covers")
        .select(COVER_COLUMNS_WITH_SEQ, { count: "exact" })
      base = withWallFilters(base, filters, { skipQuery: skipQueryIlike })
      if (pageCoverIds) {
        if (pageCoverIds.length === 0) {
          return Promise.resolve({
            data: [] as CoverRow[],
            error: null,
            count: coverIdFilter?.length ?? 0,
          })
        }
        return base.in("id", pageCoverIds)
      }
      if (coverIdFilter) {
        base = base.in("id", coverIdFilter)
      }
      return base.order("created_at", { ascending: false }).range(from, to)
    })()) as {
      data: CoverRow[] | null
      error: PostgrestError | null
      count?: number | null
    }
  }

  if (imagesResult.error && isGallerySequenceUnavailable(imagesResult.error)) {
    imagesResult = (await (() => {
      let base = supabase
        .from("gallery_wall_covers")
        .select(COVER_COLUMNS_MINIMAL, { count: "exact" })
      base = withWallFilters(base, filters, { skipQuery: skipQueryIlike })
      if (pageCoverIds) {
        if (pageCoverIds.length === 0) {
          return Promise.resolve({
            data: [] as CoverRow[],
            error: null,
            count: coverIdFilter?.length ?? 0,
          })
        }
        return base.in("id", pageCoverIds)
      }
      if (coverIdFilter) {
        base = base.in("id", coverIdFilter)
      }
      return base.order("created_at", { ascending: false }).range(from, to)
    })()) as {
      data: CoverRow[] | null
      error: PostgrestError | null
      count?: number | null
    }
  }

  if (imagesResult.error) {
    console.error("[gallery] failed to load images", imagesResult.error)
    return {
      images: [],
      members: userId
        ? buildMembers((profilesResult.data ?? []) as ProfileRow[])
        : [],
      totalCount: 0,
    }
  }
  if (profilesResult.error) {
    console.error(
      "[gallery] failed to load member profiles",
      profilesResult.error
    )
  }

  const coverRows = orderRowsByIdList(
    (imagesResult.data ?? []) as CoverRow[],
    pageCoverIds ??
      ((imagesResult.data ?? []) as CoverRow[]).map((row) => row.id)
  )
  const sequenceRowsById = await loadSequenceRowsById(supabase, coverRows)

  const imageIds = coverRows.map((image) => image.id)
  const tagLookupIds = Array.from(
    new Set([
      ...imageIds,
      ...Array.from(sequenceRowsById.values()).flatMap((seqRows) =>
        seqRows.map((row) => row.id)
      ),
    ])
  )
  let countsByImage = new Map<string, typeof EMPTY_REACTION_COUNTS>()
  let namesByImage = new Map<string, typeof EMPTY_REACTION_NAMES>()
  const myReactionByImage = new Map<string, GalleryImage["my_reaction"]>()
  let commentCountByImage = new Map<string, number>()
  let nameById = buildNameById((profilesResult.data ?? []) as ProfileRow[])
  const tagsByImage = await loadTagsByImageIds(supabase, tagLookupIds)

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
      if (!isGalleryReactionsUnavailable(voteResult.error)) {
        console.error("[gallery] failed to load reactions", voteResult.error)
      }
    }
    if (commentCountResult.error) {
      if (!isGalleryCommentsUnavailable(commentCountResult.error)) {
        console.error(
          "[gallery] failed to load comment counts",
          commentCountResult.error
        )
      }
    }

    const voteRows = voteResult.error ? [] : (voteResult.data ?? [])
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
          // anon is column-granted to id/name only (email is authenticated+).
          .select("id, name")
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

  const images: GalleryImage[] = coverRows.map((image) => {
    const base = toGalleryImageBase(image)
    base.comment_count = commentCountByImage.get(image.id) ?? 0
    base.uploader_name = image.created_by
      ? (nameById.get(image.created_by) ?? "Unknown")
      : "Unknown"
    base.reaction_counts = countsByImage.get(image.id) ?? EMPTY_REACTION_COUNTS
    base.my_reaction = myReactionByImage.get(image.id) ?? null
    base.reaction_names = namesByImage.get(image.id) ?? EMPTY_REACTION_NAMES
    base.tags = tagsByImage.get(image.id) ?? []
    return base
  })

  expandSequences(images, sequenceRowsById, tagsByImage)

  const favoritedIds = await loadFavoritedImageIds(
    supabase,
    userId,
    tagLookupIds
  )
  applyFavoriteFlags(images, favoritedIds)

  return {
    images,
    members: userId
      ? buildMembers((profilesResult.data ?? []) as ProfileRow[])
      : [],
    totalCount: rankedSearchPaging
      ? (coverIdFilter?.length ?? 0)
      : (imagesResult.count ?? 0),
  }
}

async function loadGalleryHomeRange(
  supabase: SupabaseClient,
  args: RangeArgs
): Promise<RangeResult> {
  const viaView = await loadGalleryHomeRangeViaView(supabase, args)
  if (viaView) return viaView
  return loadGalleryHomeRangeLegacy(supabase, args)
}

const DEFAULT_FILTERS: GalleryHomeFilters = {
  uploaderId: null,
  media: "all",
  uploadedAfter: null,
  query: null,
  tagSlug: null,
  savedOnly: false,
  albumSlug: null,
}

export async function loadGalleryHomePage(
  supabase: SupabaseClient,
  {
    page,
    userId,
    filters = DEFAULT_FILTERS,
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
  const { images, members, totalCount } = await loadGalleryHomeRange(supabase, {
    from,
    to,
    userId,
    filters,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / GALLERY_PAGE_SIZE))
  return { images, members, totalPages, currentPage }
}

export async function loadGalleryHomePages(
  supabase: SupabaseClient,
  {
    throughPage,
    userId,
    filters = DEFAULT_FILTERS,
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
  // One range query for pages 1..N — avoids N parallel page round-trips on deep links.
  const { images, members, totalCount } = await loadGalleryHomeRange(supabase, {
    from: 0,
    to: targetPage * GALLERY_PAGE_SIZE - 1,
    userId,
    filters,
  })
  const totalPages = Math.max(1, Math.ceil(totalCount / GALLERY_PAGE_SIZE))

  return {
    images,
    members,
    totalPages,
    currentPage: targetPage,
    hasMore: targetPage < totalPages,
  }
}
