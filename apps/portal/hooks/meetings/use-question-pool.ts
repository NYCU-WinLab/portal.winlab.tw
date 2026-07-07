"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"
import {
  toQuestionPoolMember,
  type DbQuestionPoolMember,
  type QuestionPoolMember,
} from "@/lib/meetings/types"

import { queryKeys } from "./query-keys"

const VIEW = "meeting_question_rotation"
const TABLE = "meeting_question_pool"

export function useQuestionPool() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questionPool.all,
    queryFn: async (): Promise<QuestionPoolMember[]> => {
      const { data, error } = await supabase
        .from(VIEW)
        .select("*")
        .order("last_asked_date", { ascending: true, nullsFirst: true })
        .order("pool_added_at", { ascending: true })
        .order("user_id", { ascending: true })
      if (error) throw new Error(error.message || "讀取成員池失敗")
      return (data as DbQuestionPoolMember[]).map(toQuestionPoolMember)
    },
  })
}

export function useAddPoolMember() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from(TABLE)
        .upsert(
          { user_id: userId },
          { onConflict: "user_id", ignoreDuplicates: true }
        )
      if (error) throw new Error(error.message || "加入成員池失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      toast.success("已加入成員池")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemovePoolMember() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
      if (error) throw new Error(error.message || "移出成員池失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      toast.success("已移出成員池")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
