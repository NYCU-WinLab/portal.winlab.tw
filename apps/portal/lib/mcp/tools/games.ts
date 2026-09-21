import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { formatTime, GAME_META, GAME_ORDER } from "@/lib/games/constants"
import { fetchLeaderboard } from "@/lib/games/fetch"
import type { GameScore, GameType } from "@/lib/games/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

export type LeaderboardRow = {
  rank: number
  user_id: string
  user_name: string
  score: number
  score_label: string
  finish_time_ms: number
  finish_time_label: string
  achieved_at: string
}

// The RPC already returns one best run per player, ordered score desc then
// fastest finish, so rank is the position in that list.
export function leaderboardRows(
  gameType: GameType,
  scores: GameScore[]
): LeaderboardRow[] {
  const meta = GAME_META[gameType]
  return scores.map((s, i) => ({
    rank: i + 1,
    user_id: s.user_id,
    user_name: s.user_name,
    score: s.score,
    score_label: meta.scoreLabel(s.score),
    finish_time_ms: s.finish_time_ms,
    finish_time_label: formatTime(s.finish_time_ms),
    achieved_at: s.achieved_at,
  }))
}

export function registerGamesTools(server: McpServer) {
  server.registerTool(
    "list_leaderboard",
    {
      title: "List game leaderboard",
      description:
        "Top 20 of one game in /games, one row per player (their personal best), ranked by score then by the faster finish. The board is the same for everyone: get_game_leaderboard is SECURITY DEFINER, so no result here depends on who the member is and there is nothing admin-only. level narrows it to a single difficulty or board size for the games that have levels; omit it for the combined board. Submitting a score is not a tool, members play at /games.",
      inputSchema: z.object({
        game_type: z.enum(GAME_ORDER),
        level: z
          .number()
          .int()
          .optional()
          .describe("Only this level, omit for all levels"),
      }),
    },
    async ({ game_type, level }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const scores = await fetchLeaderboard(
          supabase,
          game_type,
          level ?? null
        )
        const rows = leaderboardRows(game_type, scores)
        return json({
          game_type,
          game_label: GAME_META[game_type].title,
          level: level ?? null,
          count: rows.length,
          url: `${PORTAL_URL}/games/${game_type}`,
          entries: rows,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
