"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchLeaves } from "@/lib/leave/fetch"
import { createLeave, deleteLeave } from "@/lib/leave/mutations"
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
    mutationFn: (params: { user_id: string; date: string; reason: string }) =>
      createLeave(supabase, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all })
    },
  })
}

export function useDeleteLeave() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (leaveId: string) => deleteLeave(supabase, leaveId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.leaves.all })
    },
  })
}
