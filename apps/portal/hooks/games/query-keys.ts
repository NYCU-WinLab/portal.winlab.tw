import type { GameType } from "@/lib/games/types"

export const queryKeys = {
  leaderboard: {
    all: ["games", "leaderboard"] as const,
    byGame: (game: GameType) => ["games", "leaderboard", game] as const,
  },
}
