"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Leave, LeaveWithUser } from "@/lib/leave/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useLeaves() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.leaves.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leaves")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })

      if (error) throw error

      const leaves = (data ?? []) as Leave[]
      if (leaves.length === 0) return [] as LeaveWithUser[]

      const userIds = [...new Set(leaves.map((l) => l.user_id))]
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", userIds)

      const profileMap = new Map(
        (profiles ?? []).map((p: { id: string; name: string | null }) => [
          p.id,
          p,
        ])
      )

      return leaves.map((leave) => ({
        ...leave,
        user: profileMap.has(leave.user_id)
          ? { name: profileMap.get(leave.user_id)!.name ?? null }
          : null,
      })) as LeaveWithUser[]
    },
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
