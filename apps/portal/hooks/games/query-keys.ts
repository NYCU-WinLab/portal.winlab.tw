import type { GameType } from "@/lib/games/types"

export const queryKeys = {
  leaderboard: {
    all: ["games", "leaderboard"] as const,
    byGame: (game: GameType, level: number | null = null) =>
      ["games", "leaderboard", game, level ?? "all"] as const,
  },
  quiz: {
    sets: {
      all: ["games", "quiz", "sets"] as const,
      byId: (quizSetId: string) =>
        ["games", "quiz", "sets", quizSetId] as const,
      questions: (quizSetId: string) =>
        ["games", "quiz", "sets", quizSetId, "questions"] as const,
    },
    session: (sessionId: string) =>
      ["games", "quiz", "session", sessionId] as const,
    players: (sessionId: string) =>
      ["games", "quiz", "session", sessionId, "players"] as const,
    currentQuestion: (sessionId: string) =>
      ["games", "quiz", "session", sessionId, "current-question"] as const,
  },
}
