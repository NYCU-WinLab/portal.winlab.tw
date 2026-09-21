"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchInboxCount } from "@/lib/approve/fetch"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useInboxCount(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.inboxCount(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<number> =>
      fetchInboxCount(createClient(), userId!),
  })
}
