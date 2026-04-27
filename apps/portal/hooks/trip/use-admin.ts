"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useTripAdmin() {
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

  // Trip admin is scoped to roles.trip only — the global is_admin flag does
  // NOT confer trip admin, because signatures are personal data and we don't
  // want app-level role bleed across the portal. Stays in lockstep with the
  // SQL is_trip_admin() helper.
  const roles = data?.roles as Record<string, string[]> | undefined
  const tripRoles = roles?.trip
  const isAdmin = Array.isArray(tripRoles) && tripRoles.includes("admin")

  return { isAdmin, isLoading }
}
