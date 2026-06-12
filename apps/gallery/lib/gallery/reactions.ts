/** Facebook-style reactions + WinLab point (👉👈) + cheers (🍻). One per user per work. */

export const GALLERY_REACTIONS = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
  "point",
  "cheers",
] as const

export type GalleryReaction = (typeof GALLERY_REACTIONS)[number]

export const REACTION_EMOJI: Record<GalleryReaction, string> = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
  point: "👉👈",
  cheers: "🍻",
}

export const REACTION_LABEL: Record<GalleryReaction, string> = {
  like: "Like",
  love: "Love",
  haha: "Haha",
  wow: "Wow",
  sad: "Sad",
  angry: "Angry",
  point: "Poke",
  cheers: "Cheers",
}

export type ReactionCounts = Record<GalleryReaction, number>

export type ReactionNames = Record<GalleryReaction, string[]>

function buildEmptyCounts(): ReactionCounts {
  return Object.fromEntries(
    GALLERY_REACTIONS.map((r) => [r, 0])
  ) as ReactionCounts
}

function buildEmptyNames(): ReactionNames {
  return Object.fromEntries(
    GALLERY_REACTIONS.map((r) => [r, [] as string[]])
  ) as ReactionNames
}

export const EMPTY_REACTION_COUNTS = buildEmptyCounts()
export const EMPTY_REACTION_NAMES = buildEmptyNames()

export function isGalleryReaction(value: string): value is GalleryReaction {
  return (GALLERY_REACTIONS as readonly string[]).includes(value)
}

export function totalReactions(counts: ReactionCounts): number {
  return GALLERY_REACTIONS.reduce((sum, r) => sum + counts[r], 0)
}

/** Text fallback for summaries; point uses thin space to stay on one line. */
export function formatReactionSummary(counts: ReactionCounts): string {
  return GALLERY_REACTIONS.filter((r) => counts[r] > 0)
    .map((r) => {
      const glyph = r === "point" ? "👉\u2009👈" : REACTION_EMOJI[r]
      return `${glyph} ${counts[r]}`
    })
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

    const counts = countsByImage.get(row.image_id) ?? buildEmptyCounts()
    counts[row.reaction] += 1
    countsByImage.set(row.image_id, counts)

    const names = namesByImage.get(row.image_id) ?? buildEmptyNames()
    const displayName = voterNameById.get(row.user_id) ?? "Unknown"
    names[row.reaction].push(displayName)
    namesByImage.set(row.image_id, names)
  }

  return { countsByImage, namesByImage }
}
