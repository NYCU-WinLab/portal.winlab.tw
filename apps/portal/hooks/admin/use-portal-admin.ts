"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"

import { queryKeys } from "./query-keys"

export function usePortalAdmin() {
  const { user } = useAuth()
  const supabase = createClient()

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.status,
    queryFn: async () => {
      if (!user) return false
      const { data: profile } = await supabase
        .rpc("get_my_access")
        .maybeSingle()
      return profile?.is_admin === true
    },
    enabled: !!user,
  })

  return { isPortalAdmin: data ?? false, isLoading }
}
