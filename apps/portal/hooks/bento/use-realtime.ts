"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"

import { createClient } from "@/lib/supabase/client"

import { useAuth } from "@/hooks/use-auth"

import { queryKeys } from "./query-keys"

export function useRealtime() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const supabase = createClient()
    const channel = supabase
      .channel("bento-realtime")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bento_orders",
          filter: "status=eq.closed",
        },
        (payload) => {
          toast.info("訂單已關閉", {
            description: `訂單 ${payload.new.id} 已被關閉`,
          })
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bento_orders" },
        () => {
          toast.info("新訂單", { description: "有新的訂單已建立" })
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bento_order_items" },
        (payload) => {
          if (payload.new.user_id !== user.id) {
            toast.info("新的訂餐", { description: "有人新增了訂餐項目" })
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, queryClient])
}
