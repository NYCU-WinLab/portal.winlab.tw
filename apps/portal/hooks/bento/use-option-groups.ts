"use client"

import { useQuery } from "@tanstack/react-query"

import { fetchOptionGroups } from "@/lib/bento/fetch"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

// Fetches a restaurant's option groups (e.g. 甜度, 冰量) with their values.
export function useOptionGroups(restaurantId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.optionGroups.byRestaurant(restaurantId ?? ""),
    queryFn: () => fetchOptionGroups(supabase, restaurantId!),
    enabled: !!restaurantId,
  })
}
