"use client"

import { useQuery } from "@tanstack/react-query"

import type { Member } from "@/lib/debt/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useMembers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.members.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name")
        .order("name")

      if (error) throw error
      return data as Member[]
    },
  })
}
