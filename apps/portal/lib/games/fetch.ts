import type { SupabaseClient } from "@supabase/supabase-js"

import type { GameScore, GameType } from "@/lib/games/types"

// Top 20 of one game, one row per player (their best run). Shared by the
// browser hook and the MCP tool. get_game_leaderboard is SECURITY DEFINER and
// granted to every signed-in member (not anon), so the board is the same for
// every member — `level` narrows it to one difficulty, `null` means all
// levels together.
export async function fetchLeaderboard(
  supabase: SupabaseClient,
  gameType: GameType,
  level: number | null = null
): Promise<GameScore[]> {
  const { data, error } = await supabase.rpc("get_game_leaderboard", {
    p_game_type: gameType,
    p_level: level ?? undefined,
  })
  if (error) throw error
  return (data ?? []) as GameScore[]
}
