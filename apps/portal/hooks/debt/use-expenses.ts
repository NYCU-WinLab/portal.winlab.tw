"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { useAuth } from "@/hooks/use-auth"
import type { Expense } from "@/lib/debt/types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useMyExpenses() {
  const supabase = createClient()
  const { user } = useAuth()

  return useQuery({
    queryKey: queryKeys.expenses.mine(),
    queryFn: async () => {
      if (!user) return []
      const { data, error } = await supabase
        .from("debt_expenses")
        .select("*, items:debt_expense_items(id, debtor_id, amount)")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })

      if (error) throw error
      return (data ?? []) as Expense[]
    },
    enabled: !!user,
  })
}

interface ExpenseInput {
  name: string
  description?: string
  items: { debtor_id: string; amount: number }[]
}

export function useCreateExpense() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const { data, error } = await supabase.rpc("debt_create_expense", {
        p_name: input.name,
        p_description: input.description || "",
        p_items: input.items,
      })

      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances.all })
    },
  })
}

interface UpdateExpenseInput extends ExpenseInput {
  id: string
}

export function useUpdateExpense() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: UpdateExpenseInput) => {
      const { error } = await supabase.rpc("debt_update_expense", {
        p_expense_id: input.id,
        p_name: input.name,
        p_description: input.description || "",
        p_items: input.items,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances.all })
    },
  })
}

export function useMarkItemPaid() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ itemId, paid }: { itemId: string; paid: boolean }) => {
      const { error } = await supabase.rpc("debt_mark_item_paid", {
        p_item_id: itemId,
        p_paid: paid,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.balances.all })
    },
  })
}

export function useDeleteExpense() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("debt_expenses")
        .delete()
        .eq("id", id)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.balances.all })
    },
  })
}
