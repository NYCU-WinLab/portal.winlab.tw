import type {
  GalleryReaction,
  ReactionCounts,
  ReactionNames,
} from "@/lib/gallery/reactions"

export type ReactionOptimisticOutcome = "removed" | "updated" | "added"

export type NextReactionState = {
  counts: ReactionCounts
  names: ReactionNames
  myReaction: GalleryReaction | null
  outcome: ReactionOptimisticOutcome
}

/** Pure next-state for an optimistic reaction toggle / switch / add. */
export function nextReactionState(
  prev: GalleryReaction | null,
  reaction: GalleryReaction,
  viewerName: string,
  counts: ReactionCounts,
  names: ReactionNames
): NextReactionState {
  if (prev === reaction) {
    return {
      counts: {
        ...counts,
        [reaction]: Math.max(0, counts[reaction] - 1),
      },
      names: {
        ...names,
        [reaction]: names[reaction].filter((name) => name !== viewerName),
      },
      myReaction: null,
      outcome: "removed",
    }
  }

  if (prev) {
    return {
      counts: {
        ...counts,
        [prev]: Math.max(0, counts[prev] - 1),
        [reaction]: counts[reaction] + 1,
      },
      names: {
        ...names,
        [prev]: names[prev].filter((name) => name !== viewerName),
        [reaction]: names[reaction].includes(viewerName)
          ? names[reaction]
          : [...names[reaction], viewerName],
      },
      myReaction: reaction,
      outcome: "updated",
    }
  }

  return {
    counts: { ...counts, [reaction]: counts[reaction] + 1 },
    names: {
      ...names,
      [reaction]: names[reaction].includes(viewerName)
        ? names[reaction]
        : [...names[reaction], viewerName],
    },
    myReaction: reaction,
    outcome: "added",
  }
}
