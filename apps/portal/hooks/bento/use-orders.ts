"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchOrder, fetchOrders } from "@/lib/bento/fetch"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

export function useOrders() {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.orders.list(),
    queryFn: () => fetchOrders(supabase),
  })
}

export function useOrder(id: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.orders.detail(id!),
    queryFn: () => fetchOrder(supabase, id!),
    enabled: !!id,
  })
}

export function useCreateOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      p_restaurant_id: string
      p_order_date: string
      p_auto_close_at?: string | null
    }) => {
      const { data, error } = await supabase.rpc("create_bento_order", {
        p_restaurant_id: params.p_restaurant_id,
        p_order_date: params.p_order_date,
        p_auto_close_at: params.p_auto_close_at ?? undefined,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useCloseOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from("bento_orders")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", orderId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useDeleteOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase
        .from("bento_orders")
        .delete()
        .eq("id", orderId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useReopenOrder() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase
        .from("bento_orders")
        .update({ status: "active", closed_at: null })
        .eq("id", orderId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
