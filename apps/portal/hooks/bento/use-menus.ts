"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { Database } from "@/lib/supabase/database.types"
import { createClient } from "@/lib/supabase/client"

import { queryKeys } from "./query-keys"

interface UseMenusOptions {
  includeInactive?: boolean
}

export function useMenus(opts: UseMenusOptions = {}) {
  const { includeInactive = false } = opts
  const supabase = createClient()

  return useQuery({
    queryKey: [...queryKeys.menus.all, { includeInactive }] as const,
    queryFn: async () => {
      let query = supabase
        .from("bento_menus")
        .select("*, menu_items:bento_menu_items(*)")
        .order("is_active", { ascending: false })
        .order("name")

      if (!includeInactive) {
        query = query.eq("is_active", true)
      }

      const { data, error } = await query

      if (error) throw error
      return data
    },
  })
}

export function useDisabledMenuCount() {
  const supabase = createClient()

  return useQuery({
    queryKey: [...queryKeys.menus.all, "disabled-count"] as const,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("bento_menus")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false)

      if (error) throw error
      return count ?? 0
    },
  })
}

export function useToggleMenuActive() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { id: string; nextActive: boolean }) => {
      const { data, error } = await supabase
        .from("bento_menus")
        .update({
          is_active: params.nextActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
    },
  })
}

export function useMenu(id: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.menus.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bento_menus")
        .select("*, menu_items:bento_menu_items(*)")
        .eq("id", id!)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useMenuItemCounts(id: string | undefined) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.menus.stats(id!),
    queryFn: async () => {
      const { data: closedOrders } = await supabase
        .from("bento_orders")
        .select("id")
        .eq("restaurant_id", id!)
        .eq("status", "closed")

      const itemCounts: Record<string, number> = {}

      if (closedOrders && closedOrders.length > 0) {
        const orderIds = closedOrders.map((o) => o.id)

        const { data: orderItems } = await supabase
          .from("bento_order_items")
          .select("menu_item_id")
          .in("order_id", orderIds)

        if (orderItems) {
          for (const item of orderItems) {
            itemCounts[item.menu_item_id] =
              (itemCounts[item.menu_item_id] || 0) + 1
          }
        }
      }

      const { data: menuItems } = await supabase
        .from("bento_menu_items")
        .select("id, name, price")
        .eq("restaurant_id", id!)

      const items = (menuItems || []).map((item) => ({
        ...item,
        order_count: itemCounts[item.id] || 0,
      }))

      return { items }
    },
    enabled: !!id,
  })
}

interface MenuItemInput {
  id?: string
  name: string
  price: string | number
  type?: string | null
}

export function useCreateMenu() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      name: string
      phone: string
      google_map_link?: string | null
      additional?: string[] | null
      menu_items?: MenuItemInput[]
    }) => {
      const { data: menu, error } = await supabase
        .from("bento_menus")
        .insert({
          name: params.name,
          phone: params.phone,
          google_map_link: params.google_map_link?.trim() || null,
          additional: params.additional || null,
        })
        .select()
        .single()

      if (error) throw error

      if (params.menu_items && params.menu_items.length > 0) {
        const items = params.menu_items
          .filter((item) => item.name && item.price)
          .map((item) => ({
            restaurant_id: menu.id,
            name: item.name.trim(),
            price:
              typeof item.price === "number"
                ? item.price
                : parseFloat(String(item.price)) || 0,
            type: item.type?.trim() || null,
          }))

        if (items.length > 0) {
          const { error: menuError } = await supabase
            .from("bento_menu_items")
            .insert(items)

          if (menuError) throw menuError
        }
      }

      return menu
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
    },
  })
}

export function useUpdateMenu(id: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      name?: string
      phone?: string
      google_map_link?: string | null
      additional?: string[] | null
      menu_items?: MenuItemInput[]
    }) => {
      const updatePayload: Database["public"]["Tables"]["bento_menus"]["Update"] =
        {
          updated_at: new Date().toISOString(),
        }
      if (params.name !== undefined) updatePayload.name = params.name
      if (params.phone !== undefined) updatePayload.phone = params.phone
      if (params.additional !== undefined)
        updatePayload.additional = params.additional
      if (params.google_map_link !== undefined) {
        updatePayload.google_map_link = params.google_map_link?.trim() || null
      }

      const { data: menu, error } = await supabase
        .from("bento_menus")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single()

      if (error) throw error

      if (params.menu_items) {
        const { data: existingItems } = await supabase
          .from("bento_menu_items")
          .select("id")
          .eq("restaurant_id", id)

        const existingIds = new Set(
          (existingItems || []).map((item) => item.id)
        )
        const retainedIds = new Set<string>()
        const itemsToUpdate: Array<{
          id: string
          name: string
          price: number
          type: string | null
        }> = []
        const itemsToInsert: Array<{
          restaurant_id: string
          name: string
          price: number
          type: string | null
        }> = []

        for (const item of params.menu_items) {
          const parsedPrice =
            typeof item.price === "number"
              ? item.price
              : parseFloat(String(item.price)) || 0
          const parsedType = item.type?.trim() || null

          if (item.id && existingIds.has(item.id)) {
            retainedIds.add(item.id)
            itemsToUpdate.push({
              id: item.id,
              name: item.name,
              price: parsedPrice,
              type: parsedType,
            })
          } else {
            itemsToInsert.push({
              restaurant_id: id,
              name: item.name,
              price: parsedPrice,
              type: parsedType,
            })
          }
        }

        const idsToDelete = [...existingIds].filter(
          (existingId) => !retainedIds.has(existingId)
        )
        if (idsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from("bento_menu_items")
            .delete()
            .in("id", idsToDelete)
          if (deleteError) throw deleteError
        }

        for (const item of itemsToUpdate) {
          const { error: updateError } = await supabase
            .from("bento_menu_items")
            .update({ name: item.name, price: item.price, type: item.type })
            .eq("id", item.id)
          if (updateError) throw updateError
        }

        if (itemsToInsert.length > 0) {
          const { error: insertError } = await supabase
            .from("bento_menu_items")
            .insert(itemsToInsert)
          if (insertError) throw insertError
        }
      }

      return menu
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.stats(id) })
    },
  })
}

export function useDeleteMenu(id: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("bento_menus").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
    },
  })
}

const MENU_IMAGE_BUCKET = "bento-menus"

async function clearMenuImageFolder(
  supabase: ReturnType<typeof createClient>,
  restaurantId: string
) {
  const { data: existing } = await supabase.storage
    .from(MENU_IMAGE_BUCKET)
    .list(restaurantId)
  if (existing && existing.length > 0) {
    await supabase.storage
      .from(MENU_IMAGE_BUCKET)
      .remove(existing.map((f) => `${restaurantId}/${f.name}`))
  }
}

// Uploads a restaurant's image menu to the public bento-menus bucket (one file
// per restaurant, replacing any previous one) and stores its URL on the row.
export function useUploadMenuImage(restaurantId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      await clearMenuImageFolder(supabase, restaurantId)

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg"
      const path = `${restaurantId}/menu.${ext}`
      const { error: uploadError } = await supabase.storage
        .from(MENU_IMAGE_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path)
      // Cache-bust so the <img> refreshes when the menu is replaced.
      const url = `${publicUrl}?v=${Date.now()}`

      const { error: updateError } = await supabase
        .from("bento_menus")
        .update({ menu_image_url: url, updated_at: new Date().toISOString() })
        .eq("id", restaurantId)
      if (updateError) throw updateError

      return url
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.menus.detail(restaurantId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}

export function useRemoveMenuImage(restaurantId: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      await clearMenuImageFolder(supabase, restaurantId)
      const { error } = await supabase
        .from("bento_menus")
        .update({ menu_image_url: null, updated_at: new Date().toISOString() })
        .eq("id", restaurantId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.menus.all })
      queryClient.invalidateQueries({
        queryKey: queryKeys.menus.detail(restaurantId),
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
    },
  })
}
