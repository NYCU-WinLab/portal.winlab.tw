"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useInboxCount(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.inboxCount(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      const supabase = createClient()
      const { count, error } = await supabase
        .from("approve_signers")
        .select("id", { count: "exact", head: true })
        .eq("signer_id", userId!)
        .eq("status", "pending")
      if (error) throw error
      return count ?? 0
    },
  })
}
