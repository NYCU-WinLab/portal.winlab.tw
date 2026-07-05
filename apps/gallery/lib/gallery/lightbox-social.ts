import type { SupabaseClient } from "@supabase/supabase-js"

import {
  aggregateCommentLikes,
  buildGalleryComments,
  loadGalleryCommentRowsWithSocial,
} from "@/lib/gallery/comment-social"
import {
  aggregateReactions,
  isGalleryReaction,
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
} from "@/lib/gallery/reactions"
import type { GalleryReaction } from "@/lib/gallery/reactions"

export async function loadLightboxSocial(
  supabase: SupabaseClient,
  imageId: string,
  viewerId: string | null
) {
  const [commentLoad, voteResult] = await Promise.all([
    loadGalleryCommentRowsWithSocial(supabase, [imageId], viewerId),
    supabase
      .from("gallery_image_votes")
      .select("image_id, user_id, reaction")
      .eq("image_id", imageId),
  ])

  const commentRows = commentLoad.error ? [] : commentLoad.rows
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

  const social = aggregateCommentLikes(
    commentLoad.error ? [] : commentLoad.likes,
    viewerId
  )
  const comments = buildGalleryComments(commentRows, nameById, social)

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
