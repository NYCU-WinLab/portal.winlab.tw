"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type {
  QuizAnswerRecord,
  QuizSessionQuestion,
  QuizSessionSummary,
} from "@/lib/games/quiz/types"

import { queryKeys } from "./query-keys"

// RLS on quiz_sessions already scopes this to sessions the caller hosted or
// played in -- no extra filter needed beyond status = 'ended'.
export function useQuizHistory() {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.history.all,
    queryFn: async (): Promise<QuizSessionSummary[]> => {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .select("*, quiz_sets(title)")
        .eq("status", "ended")
        .order("ended_at", { ascending: false })
      if (error) throw error
      return (data ?? []).map(({ quiz_sets, ...session }) => ({
        ...session,
        quiz_title: quiz_sets?.title ?? "(已刪除的題庫)",
      })) as QuizSessionSummary[]
    },
  })
}

// Only readable once the session is 'ended' -- see
// quiz_session_questions_select. Frozen at create_quiz_session time, so
// this reflects exactly what was asked, even if the source quiz set has
// since been edited or deleted.
export function useQuizSessionQuestions(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.history.questions(sessionId),
    queryFn: async (): Promise<QuizSessionQuestion[]> => {
      const { data, error } = await supabase
        .from("quiz_session_questions")
        .select("*")
        .eq("session_id", sessionId)
        .order("position", { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

// RLS on quiz_answers gives the host every player's answers, and gives a
// regular player only their own -- so this hook returns the right scope
// for whoever calls it without needing to branch on role.
export function useQuizSessionAnswers(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.history.answers(sessionId),
    queryFn: async (): Promise<QuizAnswerRecord[]> => {
      const { data, error } = await supabase
        .from("quiz_answers")
        .select("*")
        .eq("session_id", sessionId)
      if (error) throw error
      return data ?? []
    },
  })
}
