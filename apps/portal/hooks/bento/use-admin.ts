"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { useAuth } from "@/hooks/use-auth"

import { queryKeys } from "./query-keys"

export function useAdmin() {
  const { user } = useAuth()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.status,
    queryFn: async () => {
      if (!user) return null
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("roles")
        .eq("id", user.id)
        .single()
      return profile
    },
    enabled: !!user,
  })

  const roles = data?.roles as Record<string, string[]> | undefined
  const bentoRoles = roles?.bento
  const isAdmin = Array.isArray(bentoRoles) && bentoRoles.includes("admin")

  return { isAdmin, isLoading }
}
