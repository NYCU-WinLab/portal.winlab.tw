"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"

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

export function useDeleteOrderItem() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("bento_order_items")
        .delete()
        .eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
