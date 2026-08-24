"use client"

import { useMemo } from "react"
import { useMutation } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

// submit_quiz_answer returns void by design -- it never tells the caller
// whether they were right (that would leak the answer key before reveal).
// The player learns their result from useCurrentQuizQuestion once the host
// calls reveal_quiz_answer.
export function useSubmitQuizAnswer(sessionId: string) {
  const supabase = useMemo(() => createClient(), [])

  return useMutation({
    mutationFn: async ({
      questionId,
      choiceIndex,
    }: {
      questionId: string
      choiceIndex: number
    }) => {
      const { error } = await supabase.rpc("submit_quiz_answer", {
        p_session_id: sessionId,
        p_question_id: questionId,
        p_choice_index: choiceIndex,
      })
      if (error) throw error
    },
  })
}
