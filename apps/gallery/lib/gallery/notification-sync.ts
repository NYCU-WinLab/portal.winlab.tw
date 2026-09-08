import {
  parseMentions,
  resolveMentionedProfiles,
  type MentionProfile,
} from "@/lib/gallery/mentions"

/**
 * Pure plan for the mention set a comment body implies.
 * Production sync lives in gallery_sync_comment_mentions (Postgres);
 * this mirrors the intended add/remove semantics for unit tests.
 */
export function planCommentMentionSync(input: {
  body: string
  authorId: string
  existingMentionUserIds: string[]
  profiles: MentionProfile[]
}): {
  mentionNames: string[]
  clearAll: boolean
  toRemove: string[]
  toAdd: MentionProfile[]
} {
  const mentionNames = parseMentions(input.body)
  const existingIds = new Set(input.existingMentionUserIds)

  if (mentionNames.length === 0) {
    return {
      mentionNames,
      clearAll: existingIds.size > 0,
      toRemove: [...existingIds],
      toAdd: [],
    }
  }

  const matched = resolveMentionedProfiles(mentionNames, input.profiles)
  const others = matched.filter((profile) => profile.id !== input.authorId)
  const targetIds = new Set(others.map((profile) => profile.id))

  return {
    mentionNames,
    clearAll: false,
    toRemove: [...existingIds].filter((id) => !targetIds.has(id)),
    toAdd: others.filter((profile) => !existingIds.has(profile.id)),
  }
}
