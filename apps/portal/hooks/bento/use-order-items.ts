"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

import {
  addOrderItemWithOptions,
  deleteOrderItem,
  type AddOrderItemWithOptionsParams,
} from "@/lib/bento/order-items"
import { createClient } from "@/lib/supabase/client"

import { useAuth } from "@/hooks/use-auth"

import { queryKeys } from "./query-keys"

interface AddOrderItemParams {
  order_id: string
  menu_item_id: string
  no_sauce?: boolean
  additional?: number | null
}

export function useAddOrderItem() {
  const { user } = useAuth()
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: AddOrderItemParams) => {
      if (!user) throw new Error("Unauthorized")

      const { data, error } = await supabase
        .from("bento_order_items")
        .insert({
          order_id: params.order_id,
          menu_item_id: params.menu_item_id,
          user_id: user.id,
          no_sauce: params.no_sauce || false,
          additional: params.additional ?? null,
        })
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

export function useAdminAddItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: AddOrderItemParams & { user_id: string }) => {
      const { data, error } = await supabase
        .from("bento_order_items")
        .insert({
          order_id: params.order_id,
          menu_item_id: params.menu_item_id,
          user_id: params.user_id,
          no_sauce: params.no_sauce || false,
          additional: params.additional ?? null,
        })
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

export function useAddAnonymousItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      params: AddOrderItemParams & {
        anonymous_name: string
        anonymous_contact: string
      }
    ) => {
      const { data, error } = await supabase
        .from("bento_order_items")
        .insert({
          order_id: params.order_id,
          menu_item_id: params.menu_item_id,
          user_id: null,
          anonymous_name: params.anonymous_name.trim(),
          anonymous_contact: params.anonymous_contact.trim(),
          no_sauce: params.no_sauce || false,
          additional: params.additional ?? null,
        })
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

// Adds an order item together with its selected options (e.g. 甜度/冰量) in one
// atomic RPC. The RPC enforces that every required option group is satisfied, so
// mandatory ice/sugar cannot be bypassed. Used for drink shops.
export function useAddOrderItemWithOptions() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: AddOrderItemWithOptionsParams) =>
      addOrderItemWithOptions(supabase, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

// "照這份點" — replaces the caller's items in an order with a copy of another
// member's. Server-side in one transaction (copy_bento_order_from_user): the
// delete and the inserts must not be separable, or a failure halfway through
// leaves the caller with no order at all. It is also the only way to carry a
// drink's 甜度/冰量 across, since bento_order_item_options has no INSERT policy.
export function useCopyOrderFromUser() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      order_id: string
      source_user_id: string
    }) => {
      const { data, error } = await supabase.rpc("copy_bento_order_from_user", {
        p_order_id: params.order_id,
        p_source_user_id: params.source_user_id,
      })

      if (error) throw error
      // The RPC returns how many lines it copied; the rows themselves arrive
      // through the invalidation below.
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useDeleteOrderItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteOrderItem(supabase, id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
