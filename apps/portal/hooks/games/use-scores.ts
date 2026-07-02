"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { GameScore, GameType } from "@/lib/games/types"
import { queryKeys } from "./query-keys"

export function useLeaderboard(
  gameType: GameType,
  level: number | null = null
) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.leaderboard.byGame(gameType, level),
    queryFn: async (): Promise<GameScore[]> => {
      const { data, error } = await supabase.rpc("get_game_leaderboard", {
        p_game_type: gameType,
        p_level: level ?? undefined,
      })
      if (error) throw error
      return (data ?? []) as GameScore[]
    },
  })
}

export function useSubmitScore(
  gameType: GameType,
  level: number | null = null
) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      score,
      finishTimeMs,
    }: {
      score: number
      finishTimeMs: number
    }) => {
      if (!Number.isFinite(score) || !Number.isFinite(finishTimeMs)) {
        throw new Error("Invalid score")
      }

      // Direct INSERT into game_scores is gated by RLS now; the only write
      // path is the submit_game_score RPC, which derives user_id from
      // auth.uid() server-side and validates per-game-type score bounds.
      const { error } = await supabase.rpc("submit_game_score", {
        p_game_type: gameType,
        p_score: Math.floor(score),
        p_finish_ms: Math.floor(finishTimeMs),
        p_level: level ?? undefined,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leaderboard.byGame(gameType, level),
      })
    },
  })
}
