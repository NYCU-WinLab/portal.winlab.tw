"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { ApproveUserFieldValue } from "@/lib/approve/types"

import { queryKeys } from "./query-keys"

export function useUserValues(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.userValues.mine(),
    enabled: !!userId,
    queryFn: async (): Promise<ApproveUserFieldValue[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("approve_user_field_values")
        .select("*")
        .eq("user_id", userId!)
      if (error) throw error
      return (data ?? []) as unknown as ApproveUserFieldValue[]
    },
  })
}
