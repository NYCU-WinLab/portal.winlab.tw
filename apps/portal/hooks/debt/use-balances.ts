"use client"

import { useQuery } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import { computeBalances, getUnsettledPeriodStart } from "@/lib/debt/balance"
import type { Balances } from "@/lib/debt/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useBalances() {
  const supabase = createClient()
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.balances.mine(),
    queryFn: async (): Promise<Balances> => {
      if (!user) return { iOwe: [], owedToMe: [] }

      const { data: latestSettlement } = await supabase
        .from("debt_settlements")
        .select("period")
        .order("period", { ascending: false })
        .limit(1)
        .maybeSingle()

      const periodStart = getUnsettledPeriodStart(
        latestSettlement?.period ?? null
      )

      const { data: items, error } = await supabase
        .from("debt_expense_items")
        .select(
          "id, debtor_id, amount, paid_at, expense:debt_expenses!inner(id, name, creator_id, created_at)"
        )
        .gte("expense.created_at", periodStart)

      if (error) throw error
      if (!items || items.length === 0) return { iOwe: [], owedToMe: [] }

      const userIds = new Set<string>()
      for (const item of items) {
        const expense = item.expense as unknown as { creator_id: string }
        userIds.add(item.debtor_id)
        userIds.add(expense.creator_id)
      }

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", Array.from(userIds))

      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.name]))

      return computeBalances(
        items as unknown as Parameters<typeof computeBalances>[0],
        user.id,
        nameMap
      )
    },
    enabled: !!user,
  })
}
