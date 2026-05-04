"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export interface AdminUser {
  id: string
  name: string | null
  email: string
  is_admin: boolean
  roles: Record<string, string[]>
}

export function useAdminUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.users,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_admin_get_users")
      if (error) throw error
      return (data ?? []) as AdminUser[]
    },
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
