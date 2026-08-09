import type { SupabaseClient } from "@supabase/supabase-js"

import {
  formatGallerySupabaseError,
  isGalleryCommentEditUnavailable,
  type GalleryCommentRow,
} from "@/lib/gallery/comment-edit"
import type { GalleryComment } from "@/lib/gallery/types"

const COMMENT_SELECT_FULL =
  "id, image_id, parent_id, body, created_by, created_at, updated_at, pinned_at"
const COMMENT_SELECT_WITH_EDIT =
  "id, image_id, parent_id, body, created_by, created_at, updated_at"
const COMMENT_SELECT_BASE =
  "id, image_id, parent_id, body, created_by, created_at"

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

export type CommentSocialLoadResult =
  | {
      rows: GalleryCommentRow[]
      likes: CommentLikeRow[]
      error: null
      commentPinAvailable: boolean
      commentLikesAvailable: boolean
    }
  | {
      rows: []
      likes: []
      error: string
      commentPinAvailable: false
      commentLikesAvailable: false
    }

export async function loadGalleryCommentRowsWithSocial(
  supabase: SupabaseClient,
  imageIds: string[],
  viewerId: string | null
): Promise<CommentSocialLoadResult> {
  if (imageIds.length === 0) {
    return {
      rows: [],
      likes: [],
      error: null,
      commentPinAvailable: true,
      commentLikesAvailable: true,
    }
  }

  const commentResult = await supabase
    .from("gallery_comments")
    .select(COMMENT_SELECT_FULL)
    .in("image_id", imageIds)
    .order("created_at", { ascending: true })

  let rows: GalleryCommentRow[] = []
  let commentPinAvailable = true

  if (!commentResult.error) {
    rows = (commentResult.data ?? []) as GalleryCommentRow[]
  } else if (isGalleryCommentEditUnavailable(commentResult.error)) {
    // pinned_at and/or updated_at missing — peel columns until the select works.
    const withEdit = await supabase
      .from("gallery_comments")
      .select(COMMENT_SELECT_WITH_EDIT)
      .in("image_id", imageIds)
      .order("created_at", { ascending: true })

    if (!withEdit.error) {
      commentPinAvailable = false
      rows = ((withEdit.data ?? []) as GalleryCommentRow[]).map((row) => ({
        ...row,
        pinned_at: null,
      }))
    } else if (isGalleryCommentEditUnavailable(withEdit.error)) {
      commentPinAvailable = false
      const base = await supabase
        .from("gallery_comments")
        .select(COMMENT_SELECT_BASE)
        .in("image_id", imageIds)
        .order("created_at", { ascending: true })

      if (base.error) {
        return {
          rows: [],
          likes: [],
          error: formatGallerySupabaseError(base.error),
          commentPinAvailable: false,
          commentLikesAvailable: false,
        }
      }

      rows = ((base.data ?? []) as GalleryCommentRow[]).map((row) => ({
        ...row,
        updated_at: null,
        pinned_at: null,
      }))
    } else {
      return {
        rows: [],
        likes: [],
        error: formatGallerySupabaseError(withEdit.error),
        commentPinAvailable: false,
        commentLikesAvailable: false,
      }
    }
  } else {
    return {
      rows: [],
      likes: [],
      error: formatGallerySupabaseError(commentResult.error),
      commentPinAvailable: false,
      commentLikesAvailable: false,
    }
  }

  const likes = await loadCommentLikes(
    supabase,
    rows.map((row) => row.id)
  )
  if (likes.error) {
    return {
      rows: [],
      likes: [],
      error: likes.error,
      commentPinAvailable: false,
      commentLikesAvailable: false,
    }
  }

  return {
    rows,
    likes: likes.data,
    error: null,
    commentPinAvailable,
    commentLikesAvailable: likes.available,
  }
}

async function loadCommentLikes(
  supabase: SupabaseClient,
  commentIds: string[]
): Promise<
  | { data: CommentLikeRow[]; error: null; available: boolean }
  | { data: []; error: string; available: false }
> {
  if (commentIds.length === 0) {
    return { data: [], error: null, available: true }
  }

  const { data, error } = await supabase
    .from("gallery_comment_likes")
    .select("comment_id, user_id")
    .in("comment_id", commentIds)

  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      /gallery_comment_likes/i.test(error.message)
    ) {
      return { data: [], error: null, available: false }
    }
    return {
      data: [],
      error: formatGallerySupabaseError(error),
      available: false,
    }
  }

  return {
    data: (data ?? []) as CommentLikeRow[],
    error: null,
    available: true,
  }
}
