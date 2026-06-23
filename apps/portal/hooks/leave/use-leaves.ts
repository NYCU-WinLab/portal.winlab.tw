"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchLeaves } from "@/lib/leave/fetch"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useLeaves() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.leaves.list(),
    queryFn: () => fetchLeaves(supabase),
  })
}

export function useCreateLeave() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      user_id: string
      date: string
      reason: string
    }) => {
      const { data, error } = await supabase
        .from("leaves")
        .insert({
          user_id: params.user_id,
          date: params.date,
          reason: params.reason,
        })
        .select()
        .single()

      if (error) {
        if (error.code === "23505") {
          throw new Error("這一天已經請過假了")
        }
        if (error.code === "23514") {
          throw new Error("請假日期只能選週一")
        }
        throw error
      }
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all })
    },
  })
}

export function useDeleteLeave() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (leaveId: string) => {
      const { error } = await supabase.from("leaves").delete().eq("id", leaveId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all })
    },
  })
}
