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

      // Attach selected options (e.g. 甜度/冰量) to each item, flat-queried so
      // typing does not depend on relationship-based nested selects.
      if (order?.order_items && order.order_items.length > 0) {
        const enriched = order.order_items
        const itemIds = enriched.map((item) => item.id)
        const { data: picks } = await supabase
          .from("bento_order_item_options")
          .select("order_item_id, option_value_id")
          .in("order_item_id", itemIds)

        if (picks && picks.length > 0) {
          const valueIds = [...new Set(picks.map((p) => p.option_value_id))]
          const { data: values } = await supabase
            .from("bento_option_values")
            .select("id, label, group_id, sort_order")
            .in("id", valueIds)
          const groupIds = [...new Set((values ?? []).map((v) => v.group_id))]
          const { data: groups } = await supabase
            .from("bento_option_groups")
            .select("id, name, sort_order")
            .in("id", groupIds)

          const valueMap = new Map((values ?? []).map((v) => [v.id, v]))
          const groupMap = new Map((groups ?? []).map((g) => [g.id, g]))

          const byItem = new Map<
            string,
            Array<{ group_name: string; label: string; group_sort: number }>
          >()
          for (const pick of picks) {
            const value = valueMap.get(pick.option_value_id)
            if (!value) continue
            const group = groupMap.get(value.group_id)
            const list = byItem.get(pick.order_item_id) ?? []
            list.push({
              group_name: group?.name ?? "",
              label: value.label,
              group_sort: group?.sort_order ?? 0,
            })
            byItem.set(pick.order_item_id, list)
          }

          order.order_items = enriched.map((item) => ({
            ...item,
            selected_options: (byItem.get(item.id) ?? [])
              .sort((a, b) => a.group_sort - b.group_sort)
              .map(({ group_name, label }) => ({ group_name, label })),
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
