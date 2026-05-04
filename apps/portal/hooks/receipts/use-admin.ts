"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useReceiptsAdmin() {
  const { user } = useAuth()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.status,
    queryFn: async () => {
      if (!user) return null
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("roles, is_admin")
        .eq("id", user.id)
        .single()
      return profile
    },
    enabled: !!user,
  })

  const roles = data?.roles as Record<string, string[]> | undefined
  const receiptRoles = roles?.receipts
  const isAdmin =
    data?.is_admin === true ||
    (Array.isArray(receiptRoles) && receiptRoles.includes("admin"))

  return { isAdmin, isLoading }
}
