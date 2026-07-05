import type { SupabaseClient } from "@supabase/supabase-js"

import {
  formatGallerySupabaseError,
  isGalleryCommentEditUnavailable,
  type GalleryCommentRow,
} from "@/lib/gallery/comment-edit"
import type { GalleryComment } from "@/lib/gallery/types"

const COMMENT_SELECT_FULL =
  "id, image_id, parent_id, body, created_by, created_at, updated_at, pinned_at"

export type CommentLikeRow = {
  comment_id: string
  user_id: string
}

export type CommentSocialMeta = {
  likeCountByComment: Map<string, number>
  likedByViewer: Set<string>
}

export function aggregateCommentLikes(
  rows: CommentLikeRow[],
  viewerId: string | null
): CommentSocialMeta {
  const likeCountByComment = new Map<string, number>()
  const likedByViewer = new Set<string>()

  for (const row of rows) {
    likeCountByComment.set(
      row.comment_id,
      (likeCountByComment.get(row.comment_id) ?? 0) + 1
    )
    if (viewerId && row.user_id === viewerId) {
      likedByViewer.add(row.comment_id)
    }
  }

  return { likeCountByComment, likedByViewer }
}

export function buildGalleryComments(
  rows: GalleryCommentRow[],
  nameById: Map<string, string>,
  social: CommentSocialMeta
): GalleryComment[] {
  return rows.map((row) => ({
    id: row.id,
    image_id: row.image_id,
    parent_id: row.parent_id ?? null,
    body: row.body,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    pinned_at: row.pinned_at ?? null,
    commenter_name: nameById.get(row.created_by) ?? "Unknown",
    like_count: social.likeCountByComment.get(row.id) ?? 0,
    liked_by_me: social.likedByViewer.has(row.id),
  }))
}

export async function loadGalleryCommentRowsWithSocial(
  supabase: SupabaseClient,
  imageIds: string[],
  viewerId: string | null
): Promise<
  | { rows: GalleryCommentRow[]; likes: CommentLikeRow[]; error: null }
  | { rows: []; likes: []; error: string }
> {
  if (imageIds.length === 0) {
    return { rows: [], likes: [], error: null }
  }

  const commentResult = await supabase
    .from("gallery_comments")
    .select(COMMENT_SELECT_FULL)
    .in("image_id", imageIds)
    .order("created_at", { ascending: true })

  if (commentResult.error) {
    if (!isGalleryCommentEditUnavailable(commentResult.error)) {
      return {
        rows: [],
        likes: [],
        error: formatGallerySupabaseError(commentResult.error),
      }
    }

    const fallback = await supabase
      .from("gallery_comments")
      .select(
        "id, image_id, parent_id, body, created_by, created_at, updated_at"
      )
      .in("image_id", imageIds)
      .order("created_at", { ascending: true })

    if (fallback.error) {
      return {
        rows: [],
        likes: [],
        error: formatGallerySupabaseError(fallback.error),
      }
    }

    const rows = ((fallback.data ?? []) as GalleryCommentRow[]).map((row) => ({
      ...row,
      updated_at: row.updated_at ?? null,
      pinned_at: null,
    }))

    const likes = await loadCommentLikes(
      supabase,
      rows.map((row) => row.id)
    )
    if (likes.error) {
      return { rows: [], likes: [], error: likes.error }
    }

    return { rows, likes: likes.data, error: null }
  }

  const rows = (commentResult.data ?? []) as GalleryCommentRow[]
  const likes = await loadCommentLikes(
    supabase,
    rows.map((row) => row.id)
  )
  if (likes.error) {
    return { rows: [], likes: [], error: likes.error }
  }

  return { rows, likes: likes.data, error: null }
}

async function loadCommentLikes(
  supabase: SupabaseClient,
  commentIds: string[]
): Promise<
  { data: CommentLikeRow[]; error: null } | { data: []; error: string }
> {
  if (commentIds.length === 0) return { data: [], error: null }

  const { data, error } = await supabase
    .from("gallery_comment_likes")
    .select("comment_id, user_id")
    .in("comment_id", commentIds)

  if (error) {
    if (
      error.code === "42P01" ||
      /gallery_comment_likes/i.test(error.message)
    ) {
      return { data: [], error: null }
    }
    return { data: [], error: formatGallerySupabaseError(error) }
  }

  return { data: (data ?? []) as CommentLikeRow[], error: null }
}
