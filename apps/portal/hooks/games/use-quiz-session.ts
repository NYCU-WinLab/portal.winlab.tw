"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import type { QuizSession } from "@/lib/games/quiz/types"

import { queryKeys } from "./query-keys"

export function useQuizSession(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.session(sessionId),
    queryFn: async (): Promise<QuizSession> => {
      const { data, error } = await supabase
        .from("quiz_sessions")
        .select("*")
        .eq("id", sessionId)
        .single()
      if (error) throw error
      return data as unknown as QuizSession
    },
  })
}

export function useCreateQuizSession() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  return useMutation({
    mutationFn: async (quizSetId: string): Promise<QuizSession> => {
      const { data, error } = await supabase.rpc("create_quiz_session", {
        p_quiz_set_id: quizSetId,
      })
      if (error) throw error
      return data as unknown as QuizSession
    },
    onSuccess: (session) => {
      router.push(`/games/quiz/host/${session.id}`)
    },
  })
}

export function useJoinQuizSession() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()

  return useMutation({
    mutationFn: async (roomCode: string) => {
      const { data, error } = await supabase.rpc("join_quiz_session", {
        p_room_code: roomCode,
      })
      if (error) throw error
      return data
    },
    onSuccess: (player) => {
      router.push(`/games/quiz/play/${player.session_id}`)
    },
  })
}

export function useAdvanceQuizSession(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("advance_quiz_session", {
        p_session_id: sessionId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.session(sessionId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.currentQuestion(sessionId),
      })
    },
  })
}

export function useRevealQuizAnswer(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reveal_quiz_answer", {
        p_session_id: sessionId,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.session(sessionId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.currentQuestion(sessionId),
      })
      // Scores are applied server-side inside reveal_quiz_answer, not at
      // submit time (see submit_quiz_answer) -- this is the point where
      // the leaderboard actually changes.
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.players(sessionId),
      })
    },
  })
}
