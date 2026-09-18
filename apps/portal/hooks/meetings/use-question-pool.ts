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

// The whole questioner roster — presenters (default questioners) and extra
// members alike, one row each. Everything that needs "who can ask" reads this:
// the Meeting 資訊 panel, and questioners-field.tsx's manual-swap menu.
//
// Ordered by rate, which is what the reconcile levels out, so the panel reads
// from most under-served to most over-served.
export function useQuestionPool() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questionPool.all,
    queryFn: async (): Promise<QuestionPoolMember[]> => {
      const { data, error } = await supabase
        .from(VIEW)
        .select(
          "user_id, name, email, joined_on, last_asked_date, times_asked, times_asked_scheduled, opportunities, rate, is_presenter, is_enabled, lab_status"
        )
        .order("rate", { ascending: true })
        .order("last_asked_date", { ascending: true, nullsFirst: true })
        .order("joined_on", { ascending: true })
        .order("user_id", { ascending: true })
      if (error) throw new Error(error.message || "讀取提問名冊失敗")
      return (data as DbQuestionPoolMember[]).map(toQuestionPoolMember)
    },
  })
}

// Every roster change reconciles future rosters at commit, so the schedule on
// screen is stale after any of these, not just the roster.
function useInvalidateRoster() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
    qc.invalidateQueries({ queryKey: queryKeys.questioners.all })
  }
}

export function useAddPoolMember() {
  const supabase = createClient()
  const invalidate = useInvalidateRoster()

  return useMutation({
    mutationFn: async (userId: string) => {
      // RPC rather than an insert: it refuses a presenter (who is already a
      // default questioner) and anyone outside the rotation, with a reason.
      const { error } = await supabase.rpc("meetings_question_pool_add", {
        p_user: userId,
      })
      if (error) throw new Error(error.message || "新增額外提問成員失敗")
    },
    onSuccess: () => {
      invalidate()
      toast.success("已新增額外提問成員")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemovePoolMember() {
  const supabase = createClient()
  const invalidate = useInvalidateRoster()

  return useMutation({
    mutationFn: async (userId: string) => {
      // Future seats are reassigned at commit; past ones stay as history.
      const { error } = await supabase.rpc("meetings_question_pool_remove", {
        p_user: userId,
      })
      if (error) throw new Error(error.message || "移除額外提問成員失敗")
    },
    onSuccess: () => {
      invalidate()
      toast.success("已移除額外提問成員")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** 停用 / 恢復某人的提問。兩者都是明天起生效，今天的會議不受影響。 */
export function useSetQuestionerEnabled() {
  const supabase = createClient()
  const invalidate = useInvalidateRoster()

  return useMutation({
    mutationFn: async (input: { userId: string; enabled: boolean }) => {
      const { error } = await supabase.rpc(
        "meetings_question_pool_set_enabled",
        { p_user: input.userId, p_enabled: input.enabled }
      )
      if (error) throw new Error(error.message || "更新提問狀態失敗")
    },
    onSuccess: (_, { enabled }) => {
      invalidate()
      toast.success(
        enabled ? "已恢復提問，明天起生效" : "已停用提問，明天起生效"
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
