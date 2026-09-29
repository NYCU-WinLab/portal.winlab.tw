"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchAdminUsers } from "@/lib/admin/fetch"
import { updateUserRoles } from "@/lib/admin/roles"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export type { AdminUser } from "@/lib/admin/fetch"

export function useAdminUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.users,
    queryFn: () => fetchAdminUsers(supabase),
  })
}

export function useUpdateUserRoles() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      targetId: string
      roles: Record<string, string[]>
      isAdmin: boolean
    }) => {
      await updateUserRoles(supabase, params)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
    },
  })
}
