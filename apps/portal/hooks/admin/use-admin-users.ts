"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchAdminUsers } from "@/lib/admin/fetch"
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
      const { error } = await supabase.rpc("portal_admin_update_user", {
        p_target_id: params.targetId,
        p_roles: params.roles,
        p_is_admin: params.isAdmin,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users })
    },
  })
}
