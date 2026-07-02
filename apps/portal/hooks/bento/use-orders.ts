"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { fetchOrders } from "@/lib/bento/fetch"
import type { Order } from "@/lib/bento/types"
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bento_orders")
        .select(
          "*, restaurants:bento_menus(*), order_items:bento_order_items(*, menu_items:bento_menu_items(*))"
        )
        .eq("id", id!)
        .single()

      if (error) throw error

      const order = data as unknown as Order

      if (order?.order_items) {
        const items = order.order_items
        const userIds = [
          ...new Set(
            items
              .map((item) => item.user_id)
              .filter((id): id is string => id !== null)
          ),
        ]

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("id, name")
            .in("id", userIds)

          const profileMap = new Map(
            (profiles || []).map((p: { id: string; name: string | null }) => [
              p.id,
              p,
            ])
          )

          order.order_items = items.map((item) => {
            if (item.user_id) {
              const profile = profileMap.get(item.user_id)
              return {
                ...item,
                user: profile ? { name: profile.name || null } : null,
              }
            }
            return {
              ...item,
              user: item.anonymous_name ? { name: item.anonymous_name } : null,
            }
          })
        } else {
          order.order_items = items.map((item) => ({
            ...item,
            user: item.anonymous_name ? { name: item.anonymous_name } : null,
          }))
        }
      }

      return order
    },
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
