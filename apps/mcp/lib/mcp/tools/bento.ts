import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

// Response helpers — MCP tool content is just text blocks, so we stringify
// a { success, data | error } envelope like mcp.ai.winlab.tw does.
function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, data }),
      },
    ],
  }
}

function err(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: false, error: message }),
      },
    ],
    isError: true,
  }
}

export function registerBentoTools(
  server: McpServer,
  supabase: SupabaseClient,
  userId: string
) {
  server.tool(
    "bento_list_restaurants",
    "List every bento restaurant (menu) with its menu items.",
    {},
    async () => {
      const { data, error } = await supabase
        .from("bento_menus")
        .select("*, menu_items:bento_menu_items(*)")
        .order("name")
      if (error) return err(error.message)
      return ok(data ?? [])
    }
  )

  server.tool(
    "bento_list_active_orders",
    "List currently-open bento orders with their restaurant and items. Useful for seeing what you can still order into.",
    {},
    async () => {
      const { data, error } = await supabase
        .from("bento_orders")
        .select(
          "id, restaurant_id, status, created_at, closed_at, auto_close_at, restaurants:bento_menus(name), order_items:bento_order_items(id, user_id, menu_item_id, no_sauce, additional, menu_items:bento_menu_items(name, price))"
        )
        .eq("status", "active")
        .order("created_at", { ascending: false })
      if (error) return err(error.message)
      return ok(data ?? [])
    }
  )

  server.tool(
    "bento_get_order",
    "Fetch one bento order by id, including every item and the person who ordered it.",
    { order_id: z.string().uuid() },
    async ({ order_id }) => {
      const { data, error } = await supabase
        .from("bento_orders")
        .select(
          "*, restaurants:bento_menus(name, additional), order_items:bento_order_items(*, menu_items:bento_menu_items(name, price))"
        )
        .eq("id", order_id)
        .maybeSingle()
      if (error) return err(error.message)
      if (!data) return err(`No order with id ${order_id}`)

      // Resolve user names for order_items (user_id → user_profiles.name).
      const items = (data.order_items ?? []) as Array<{
        user_id: string | null
      }>
      const userIds = [
        ...new Set(items.map((i) => i.user_id).filter(Boolean) as string[]),
      ]

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("id, name")
          .in("id", userIds)
        const byId = new Map(
          (profiles ?? []).map((p: { id: string; name: string | null }) => [
            p.id,
            p.name,
          ])
        )
        data.order_items = items.map((i) => ({
          ...i,
          user_name: i.user_id ? (byId.get(i.user_id) ?? null) : null,
        })) as typeof data.order_items
      }

      return ok(data)
    }
  )

  server.tool(
    "bento_add_order_item",
    "Add an item from the menu to an active bento order. You are the buyer — user_id comes from your auth token, don't pass it.",
    {
      order_id: z.string().uuid(),
      menu_item_id: z.string().uuid(),
      no_sauce: z
        .boolean()
        .optional()
        .describe("Skip the sauce. Default false."),
      additional: z
        .number()
        .int()
        .optional()
        .describe(
          "Optional surcharge in TWD for add-ons (extra rice, etc.). Must be non-negative."
        ),
    },
    async ({ order_id, menu_item_id, no_sauce, additional }) => {
      const { data, error } = await supabase
        .from("bento_order_items")
        .insert({
          order_id,
          menu_item_id,
          user_id: userId,
          no_sauce: no_sauce ?? false,
          additional: additional ?? null,
        })
        .select()
        .single()
      if (error) return err(error.message)
      return ok(data)
    }
  )

  server.tool(
    "bento_remove_my_order_item",
    "Remove one of YOUR items from a bento order. Cannot remove other people's items — RLS enforces ownership.",
    { order_item_id: z.string().uuid() },
    async ({ order_item_id }) => {
      const { error } = await supabase
        .from("bento_order_items")
        .delete()
        .eq("id", order_item_id)
        .eq("user_id", userId)
      if (error) return err(error.message)
      return ok({ removed: order_item_id })
    }
  )
}
