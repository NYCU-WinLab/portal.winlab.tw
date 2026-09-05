"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { QuizPlayer } from "@/lib/games/quiz/types"

import { queryKeys } from "./query-keys"

export function useQuizPlayers(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.players(sessionId),
    queryFn: async (): Promise<QuizPlayer[]> => {
      const { data, error } = await supabase
        .from("quiz_players")
        .select("*")
        .eq("session_id", sessionId)
        .order("score", { ascending: false })
        .order("joined_at", { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}
