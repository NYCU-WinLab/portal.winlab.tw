import type { ReactionOptimisticOutcome } from "@/lib/gallery/reaction-optimistic"

/** Toast title after an optimistic reaction mutation settles. */
export function describeReactionOutcome(
  outcome: ReactionOptimisticOutcome
): string {
  if (outcome === "removed") return "Reaction removed."
  if (outcome === "updated") return "Reaction updated."
  return "Reaction added."
}
