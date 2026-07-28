"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

/**
 * Lab members, for the attendee picker. Deliberately a rooms-local copy of
 * the same shape meetings uses — the two features just happen to need the
 * same list, and sharing a hook across apps would couple them.
 */
export function useLabUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.labUsers.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name")
        .order("name")
      if (error) throw error
      return data as { id: string; name: string | null }[]
    },
    staleTime: 5 * 60_000,
  })
}
