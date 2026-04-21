"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useUsers() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("id, name")
        .order("name")

      if (error) throw error
      return data as { id: string; name: string | null }[]
    },
  })
}
