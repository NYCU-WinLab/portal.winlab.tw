"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import {
  toPresenterPoolMember,
  type DbPresenterPoolMember,
  type PresenterPoolMember,
} from "@/lib/meetings/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

const VIEW = "meeting_presenter_roster"

export function usePresenterPool() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.presenterPool.all,
    queryFn: async (): Promise<PresenterPoolMember[]> => {
      // Explicit ordering rather than the view's: a view's internal ORDER BY
      // is not guaranteed to survive PostgREST's own query planning, and the
      // running order is the whole point of this table.
      const { data, error } = await supabase
        .from(VIEW)
        .select("*")
        .order("admission_year", { ascending: true })
        .order("sort_order", { ascending: true })
      if (error) throw new Error(error.message || "讀取報告順位失敗")
      return (data as DbPresenterPoolMember[]).map(toPresenterPoolMember)
    },
  })
}

/** Adds a member, or moves an existing one to a different cohort. */
export function useUpsertPresenter() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { userId: string; admissionYear: number }) => {
      const { error } = await supabase.rpc("meetings_pool_upsert", {
        p_user: input.userId,
        p_admission_year: input.admissionYear,
      })
      if (error) throw new Error(error.message || "加入報告順位失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presenterPool.all })
      toast.success("已更新報告順位名單")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRemovePresenter() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      // RPC rather than a delete: it also closes the gap the removal leaves in
      // that cohort's numbering.
      const { error } = await supabase.rpc("meetings_pool_remove", {
        p_user: userId,
      })
      if (error) throw new Error(error.message || "移出報告順位失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presenterPool.all })
      toast.success("已移出報告順位名單")
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useMovePresenter() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (input: { userId: string; delta: -1 | 1 }) => {
      const { error } = await supabase.rpc("meetings_pool_move", {
        p_user: input.userId,
        p_delta: input.delta,
      })
      if (error) throw new Error(error.message || "調整順位失敗")
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.presenterPool.all })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Assigns the roster, in order, to every unassigned future week of a year. */
export function useFillPresenters() {
  const supabase = createClient()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (year: number): Promise<number> => {
      const { data, error } = await supabase.rpc("meetings_fill_presenters", {
        p_year: year,
      })
      if (error) throw new Error(error.message || "自動排定報告人失敗")
      return (data as { filled?: number } | null)?.filled ?? 0
    },
    onSuccess: (filled) => {
      qc.invalidateQueries({ queryKey: queryKeys.meetings.all })
      // Assigning a presenter re-syncs that week's questioners server-side.
      qc.invalidateQueries({ queryKey: ["meetings", "questioners"] })
      // The roster view derives 已報告次數 and last-presented from `meetings`,
      // so a fill changes it too — without this the admin keeps reading the
      // pre-fill counts they are about to reorder by.
      qc.invalidateQueries({ queryKey: queryKeys.presenterPool.all })
      toast.success(
        filled > 0 ? `已排定 ${filled} 週的報告人` : "沒有可排定的空白週"
      )
    },
    onError: (e: Error) => toast.error(e.message),
  })
}
