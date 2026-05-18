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
        p_level: level,
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
      if (
        !Number.isFinite(score) ||
        !Number.isFinite(finishTimeMs) ||
        score < 0 ||
        score > 1_000_000 ||
        finishTimeMs < 1 ||
        finishTimeMs > 24 * 60 * 60 * 1000
      ) {
        throw new Error("Invalid score")
      }

      // Use getSession() instead of getUser(): the former reads/verifies the
      // JWT from localStorage (no network), the latter hits the auth server
      // (~200-500ms). RLS still gates the insert via auth.uid() server-side,
      // so token validity is enforced there.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user.id
      if (!userId) throw new Error("Not authenticated")

      const { error } = await supabase.from("game_scores").insert({
        user_id: userId,
        game_type: gameType,
        score: Math.floor(score),
        finish_time_ms: Math.floor(finishTimeMs),
        level: level,
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
