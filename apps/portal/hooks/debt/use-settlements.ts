"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import type { Member, Settlement } from "@/lib/debt/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export interface SettlementWithNames extends Settlement {
  from_user_name: string | null
  to_user_name: string | null
}

export function useMySettlements() {
  const supabase = createClient()
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.settlements.mine(),
    queryFn: async () => {
      if (!user) return [] as SettlementWithNames[]
      const { data, error } = await supabase
        .from("debt_settlements")
        .select("*")
        .or(`from_user_id.eq.${user.id},to_user_id.eq.${user.id}`)
        .is("settled_at", null)
        .order("created_at", { ascending: false })

      if (error) throw error
      if (!data || data.length === 0) return [] as SettlementWithNames[]

      const userIds = new Set<string>()
      for (const s of data) {
        userIds.add(s.from_user_id)
        userIds.add(s.to_user_id)
      }

      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("id, name")
        .in("id", Array.from(userIds))

      const nameMap = new Map(
        (profiles ?? []).map((p: Member) => [p.id, p.name])
      )

      return data.map((s) => ({
        ...s,
        from_user_name: nameMap.get(s.from_user_id) ?? null,
        to_user_name: nameMap.get(s.to_user_id) ?? null,
      })) as SettlementWithNames[]
    },
    enabled: !!user,
  })
}

export function useConfirmSettlement() {
  const supabase = createClient()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settlementId: string) => {
      if (!user) throw new Error("Not authenticated")

      const { data: settlement } = await supabase
        .from("debt_settlements")
        .select("from_user_id, to_user_id")
        .eq("id", settlementId)
        .single()

      if (!settlement) throw new Error("Settlement not found")

      if (settlement.from_user_id === user.id) {
        const { error } = await supabase.rpc("debt_confirm_settlement_from", {
          p_settlement_id: settlementId,
        })
        if (error) throw error
      } else if (settlement.to_user_id === user.id) {
        const { error } = await supabase.rpc("debt_confirm_settlement_to", {
          p_settlement_id: settlementId,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settlements.all })
    },
  })
}
