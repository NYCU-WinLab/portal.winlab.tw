"use client"

import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { QuizQuestion, QuizSet } from "@/lib/games/quiz/types"

import { useAuth } from "@/hooks/use-auth"

import { queryKeys } from "./query-keys"

export function useQuizSets() {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.sets.all,
    queryFn: async (): Promise<QuizSet[]> => {
      const { data, error } = await supabase
        .from("quiz_sets")
        .select("*")
        .order("created_at", { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useQuizSet(quizSetId: string | null) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.sets.byId(quizSetId ?? ""),
    enabled: !!quizSetId,
    queryFn: async (): Promise<QuizSet> => {
      const { data, error } = await supabase
        .from("quiz_sets")
        .select("*")
        .eq("id", quizSetId!)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useQuizQuestions(quizSetId: string | null) {
  const supabase = useMemo(() => createClient(), [])

  return useQuery({
    queryKey: queryKeys.quiz.sets.questions(quizSetId ?? ""),
    enabled: !!quizSetId,
    queryFn: async (): Promise<QuizQuestion[]> => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_set_id", quizSetId!)
        .order("position", { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useCreateQuizSet() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()
  const { user } = useAuth()

  return useMutation({
    mutationFn: async (title: string): Promise<QuizSet> => {
      if (!user) throw new Error("not authenticated")

      const { data, error } = await supabase
        .from("quiz_sets")
        .insert({ title, created_by: user.id })
        .select("*")
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quiz.sets.all })
    },
  })
}

export function useUpdateQuizSet() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      quizSetId,
      title,
    }: {
      quizSetId: string
      title: string
    }) => {
      const { error } = await supabase
        .from("quiz_sets")
        .update({ title })
        .eq("id", quizSetId)
      if (error) throw error
    },
    onSuccess: (_data, { quizSetId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.sets.byId(quizSetId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.quiz.sets.all })
    },
  })
}

export function useDeleteQuizSet() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (quizSetId: string) => {
      const { error } = await supabase
        .from("quiz_sets")
        .delete()
        .eq("id", quizSetId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.quiz.sets.all })
    },
  })
}

export interface QuizQuestionDraft {
  question_text: string
  choices: string[]
  correct_index: number
  time_limit_seconds: number
}

export function useSaveQuizQuestions() {
  const supabase = useMemo(() => createClient(), [])
  const queryClient = useQueryClient()

  return useMutation({
    // The editor holds the full ordered draft locally (reordering is just
    // array moves), so saving replaces the whole question list in one go
    // rather than diffing individual rows against their stored position.
    mutationFn: async ({
      quizSetId,
      questions,
    }: {
      quizSetId: string
      questions: QuizQuestionDraft[]
    }) => {
      const { error: deleteError } = await supabase
        .from("quiz_questions")
        .delete()
        .eq("quiz_set_id", quizSetId)
      if (deleteError) throw deleteError

      if (questions.length === 0) return

      const { error: insertError } = await supabase
        .from("quiz_questions")
        .insert(
          questions.map((question, index) => ({
            quiz_set_id: quizSetId,
            position: index + 1,
            question_text: question.question_text,
            choices: question.choices,
            correct_index: question.correct_index,
            time_limit_seconds: question.time_limit_seconds,
          }))
        )
      if (insertError) throw insertError
    },
    onSuccess: (_data, { quizSetId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.quiz.sets.questions(quizSetId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.quiz.sets.all })
    },
  })
}
