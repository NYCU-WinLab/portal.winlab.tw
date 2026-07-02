import type { SupabaseClient } from "@supabase/supabase-js"

import { loadGalleryCommentRows } from "@/lib/gallery/comment-edit"
import {
  aggregateReactions,
  isGalleryReaction,
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
} from "@/lib/gallery/reactions"
import type { GalleryComment } from "@/lib/gallery/types"
import type { GalleryReaction } from "@/lib/gallery/reactions"

export async function loadLightboxSocial(
  supabase: SupabaseClient,
  imageId: string,
  viewerId: string | null
): Promise<{
  comments: GalleryComment[]
  reaction_counts: typeof EMPTY_REACTION_COUNTS
  reaction_names: typeof EMPTY_REACTION_NAMES
  my_reaction: GalleryReaction | null
}> {
  const [commentResult, voteResult] = await Promise.all([
    loadGalleryCommentRows(supabase, [imageId]),
    supabase
      .from("gallery_image_votes")
      .select("image_id, user_id, reaction")
      .eq("image_id", imageId),
  ])

  const commentRows = commentResult.error ? [] : commentResult.data
  const voteRows = voteResult.data ?? []

  const profileIds = Array.from(
    new Set([
      ...commentRows.map((row) => row.created_by),
      ...voteRows.map((row) => row.user_id),
    ])
  )

  let nameById = new Map<string, string>()
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, name, email")
      .in("id", profileIds)

    for (const profile of profiles ?? []) {
      const fallback =
        typeof profile.email === "string" ? profile.email.split("@")[0] : null
      const name =
        (typeof profile.name === "string" && profile.name.trim()) ||
        fallback ||
        "Unknown"
      nameById.set(profile.id, name)
    }
  }

  const comments: GalleryComment[] = commentRows.map((row) => ({
    id: row.id,
    image_id: row.image_id,
    parent_id: row.parent_id ?? null,
    body: row.body,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
    commenter_name: nameById.get(row.created_by) ?? "Unknown",
  }))

  const aggregated = aggregateReactions(voteRows, nameById)
  const counts = aggregated.countsByImage.get(imageId) ?? EMPTY_REACTION_COUNTS
  const names = aggregated.namesByImage.get(imageId) ?? EMPTY_REACTION_NAMES

  let myReaction: GalleryReaction | null = null
  if (viewerId) {
    for (const row of voteRows) {
      if (row.user_id === viewerId && isGalleryReaction(row.reaction)) {
        myReaction = row.reaction
        break
      }
    }
  }

  return {
    comments,
    reaction_counts: counts,
    reaction_names: names,
    my_reaction: myReaction,
  }
}
