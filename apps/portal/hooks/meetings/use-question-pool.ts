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
const MEMBERS_VIEW = "meeting_question_pool_members"
const TABLE = "meeting_question_pool"

// Reads the WIDENED rotation view (question pool ∪ presenter pool). Feeds
// questioners-field.tsx's manual-swap candidate list, which should see the
// full union of eligible questioners.
//
// Ordered by rate — the same leading key meetings_sync_questioners picks with —
// so the panel's running order and the automation never disagree about who is
// next. The picker's second key (recent co-pairing) is per-meeting and cannot
// exist in a flat list, so the two can still differ on ties; rate is the part
// that has to match.
export function useQuestionPool() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questionPool.all,
    queryFn: async (): Promise<QuestionPoolMember[]> => {
      const { data, error } = await supabase
        .from(VIEW)
        .select("*")
        .order("rate", { ascending: true })
        .order("last_asked_date", { ascending: true, nullsFirst: true })
        .order("pool_added_at", { ascending: true })
        .order("user_id", { ascending: true })
      if (error) throw new Error(error.message || "讀取成員池失敗")
      return (data as DbQuestionPoolMember[]).map(toQuestionPoolMember)
    },
  })
}

// Reads the NARROW meeting_question_pool_members view (question pool only).
// Feeds the "額外提問成員" admin panel, which manages only
// meeting_question_pool and must not list presenter-pool members.
export function useQuestionPoolMembers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.questionPool.members,
    queryFn: async (): Promise<QuestionPoolMember[]> => {
      const { data, error } = await supabase
        .from(MEMBERS_VIEW)
        .select("*")
        .order("rate", { ascending: true })
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
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.members })
      // Since 20260914083733 a pool insert rebalances every future roster, so
      // the schedule on screen is stale too — the same reason
      // useRemovePoolMember has always done this.
      qc.invalidateQueries({ queryKey: queryKeys.questioners.all })
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
      // RPC, not a direct delete: it also evicts the member from FUTURE
      // meetings' questioner rosters and backfills those slots from the pool,
      // all in one transaction. Past meetings are left as history.
      const { error } = await supabase.rpc("meetings_remove_from_pool", {
        p_user: userId,
      })
      if (error) throw new Error(error.message || "移出成員池失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.all })
      qc.invalidateQueries({ queryKey: queryKeys.questionPool.members })
      // Upcoming rosters may have changed — refresh questioners too.
      qc.invalidateQueries({ queryKey: queryKeys.questioners.all })
      toast.success("已移出成員池")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
