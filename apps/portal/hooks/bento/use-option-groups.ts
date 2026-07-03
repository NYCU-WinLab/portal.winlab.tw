"use client"

import { useQuery } from "@tanstack/react-query"

import { createClient } from "@/lib/supabase/client"
import type { OptionGroup, OptionValue } from "@/lib/bento/types"

import { queryKeys } from "./query-keys"

// Fetches a restaurant's option groups (e.g. 甜度, 冰量) with their values.
// Flat two-step query (groups, then values) so typing does not depend on
// relationship-based nested selects.
export function useOptionGroups(restaurantId: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.optionGroups.byRestaurant(restaurantId ?? ""),
    queryFn: async (): Promise<OptionGroup[]> => {
      const { data: groups, error: groupsError } = await supabase
        .from("bento_option_groups")
        .select("id, restaurant_id, name, required, single_select, sort_order")
        .eq("restaurant_id", restaurantId!)
        .order("sort_order")

      if (groupsError) throw groupsError
      if (!groups || groups.length === 0) return []

      const groupIds = groups.map((g) => g.id)
      const { data: values, error: valuesError } = await supabase
        .from("bento_option_values")
        .select("id, group_id, label, price_delta, sort_order")
        .in("group_id", groupIds)
        .order("sort_order")

      if (valuesError) throw valuesError

      const valuesByGroup = new Map<string, OptionValue[]>()
      for (const value of (values ?? []) as OptionValue[]) {
        const list = valuesByGroup.get(value.group_id) ?? []
        list.push(value)
        valuesByGroup.set(value.group_id, list)
      }

      return groups.map((group) => ({
        ...group,
        values: valuesByGroup.get(group.id) ?? [],
      }))
    },
    enabled: !!restaurantId,
  })
}
