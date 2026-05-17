"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { GameScore, GameType } from "@/lib/games/types"
import { queryKeys } from "./query-keys"

export function useLeaderboard(gameType: GameType) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.leaderboard.byGame(gameType),
    queryFn: async (): Promise<GameScore[]> => {
      const { data, error } = await supabase.rpc("get_game_leaderboard", {
        p_game_type: gameType,
      })
      if (error) throw error
      return (data ?? []) as GameScore[]
    },
  })
}

export function useSubmitScore(gameType: GameType) {
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
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { error } = await supabase.from("game_scores").insert({
        user_id: user.id,
        game_type: gameType,
        score,
        finish_time_ms: finishTimeMs,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.leaderboard.byGame(gameType),
      })
    },
  })
}
