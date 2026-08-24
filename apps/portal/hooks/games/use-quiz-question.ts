"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { CurrentQuestion } from "@/lib/games/quiz/types"

import { queryKeys } from "./query-keys"

export function useCurrentQuizQuestion(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.currentQuestion(sessionId),
    queryFn: async (): Promise<CurrentQuestion | null> => {
      const { data, error } = await supabase.rpc("get_current_question", {
        p_session_id: sessionId,
      })
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}
