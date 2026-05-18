import type { GameType } from "@/lib/games/types"

export const queryKeys = {
  leaderboard: {
    all: ["games", "leaderboard"] as const,
    byGame: (game: GameType, level: number | null = null) =>
      ["games", "leaderboard", game, level ?? "all"] as const,
  },
}
