export const GALLERY_REACTIONS = ["like", "love", "point"] as const

export type GalleryReaction = (typeof GALLERY_REACTIONS)[number]

export const REACTION_EMOJI: Record<GalleryReaction, string> = {
  like: "👍",
  love: "❤️",
  point: "👉👈",
}

export const REACTION_LABEL: Record<GalleryReaction, string> = {
  like: "Like",
  love: "Love",
  point: "Poke",
}

export type ReactionCounts = Record<GalleryReaction, number>

export type ReactionNames = Record<GalleryReaction, string[]>

export const EMPTY_REACTION_COUNTS: ReactionCounts = {
  like: 0,
  love: 0,
  point: 0,
}

export const EMPTY_REACTION_NAMES: ReactionNames = {
  like: [],
  love: [],
  point: [],
}

export function isGalleryReaction(value: string): value is GalleryReaction {
  return (GALLERY_REACTIONS as readonly string[]).includes(value)
}

export function totalReactions(counts: ReactionCounts): number {
  return counts.like + counts.love + counts.point
}

export function formatReactionSummary(counts: ReactionCounts): string {
  return GALLERY_REACTIONS.filter((r) => counts[r] > 0)
    .map((r) => `${REACTION_EMOJI[r]} ${counts[r]}`)
    .join(" · ")
}

type VoteRow = { image_id: string; user_id: string; reaction: string }

export function aggregateReactions(
  voteRows: VoteRow[],
  voterNameById: Map<string, string>
): {
  countsByImage: Map<string, ReactionCounts>
  namesByImage: Map<string, ReactionNames>
} {
  const countsByImage = new Map<string, ReactionCounts>()
  const namesByImage = new Map<string, ReactionNames>()

  for (const row of voteRows) {
    if (!isGalleryReaction(row.reaction)) continue

    const counts = countsByImage.get(row.image_id) ?? {
      ...EMPTY_REACTION_COUNTS,
    }
    counts[row.reaction] += 1
    countsByImage.set(row.image_id, counts)

    const names = namesByImage.get(row.image_id) ?? {
      like: [],
      love: [],
      point: [],
    }
    const name = voterNameById.get(row.user_id) ?? "Unknown"
    names[row.reaction].push(name)
    namesByImage.set(row.image_id, names)
  }

  return { countsByImage, namesByImage }
}
