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

  // --- Menu management (admin / RLS-gated) ---
  // Intended flow: user pastes a menu at the agent, agent calls
  // bento_create_restaurant once, then bento_add_menu_items once with
  // the parsed items. update/delete_menu_item cover parse corrections.

  server.tool(
    "bento_create_restaurant",
    "Create a new bento restaurant (the row in bento_menus). Returns the new id. Use this before bento_add_menu_items when seeding a new restaurant's menu.",
    {
      name: z.string().min(1),
      phone: z.string().min(1).describe("Digits only, no dashes."),
      google_map_link: z.string().url().optional(),
      additional: z
        .array(z.string())
        .optional()
        .describe(
          "Order-time options for every item, e.g. ['正常','半飯','不飯'] or ['不辣','小辣','中辣','大辣']."
        ),
    },
    async ({ name, phone, google_map_link, additional }) => {
      const { data, error } = await supabase
        .from("bento_menus")
        .insert({
          name,
          phone,
          google_map_link: google_map_link ?? null,
          additional: additional ?? null,
        })
        .select()
        .single()
      if (error) return err(error.message)
      return ok(data)
    }
  )

  server.tool(
    "bento_add_menu_items",
    "Bulk-insert menu items into an existing restaurant. One call for the whole menu. `type` is the category shown to diners (e.g. '炸類','烤類','飯類','水餃','湯品'); omit or null if the restaurant doesn't group items.",
    {
      restaurant_id: z
        .string()
        .uuid()
        .describe(
          "bento_menus.id — from bento_create_restaurant or bento_list_restaurants."
        ),
      items: z
        .array(
          z.object({
            name: z.string().min(1),
            price: z.number().int().nonnegative(),
            type: z.string().optional(),
          })
        )
        .min(1)
        .max(200),
    },
    async ({ restaurant_id, items }) => {
      const { data, error } = await supabase
        .from("bento_menu_items")
        .insert(
          items.map((i) => ({
            restaurant_id,
            name: i.name,
            price: i.price,
            type: i.type ?? null,
          }))
        )
        .select()
      if (error) return err(error.message)
      return ok({ inserted: data?.length ?? 0, items: data ?? [] })
    }
  )

  server.tool(
    "bento_update_menu_item",
    "Patch a single menu item. Use when a parse was slightly wrong — fix name/price/type without deleting and re-adding.",
    {
      menu_item_id: z.string().uuid(),
      name: z.string().min(1).optional(),
      price: z.number().int().nonnegative().optional(),
      type: z
        .string()
        .nullable()
        .optional()
        .describe("Pass null to clear the category."),
    },
    async ({ menu_item_id, name, price, type }) => {
      const patch: Record<string, unknown> = {}
      if (name !== undefined) patch.name = name
      if (price !== undefined) patch.price = price
      if (type !== undefined) patch.type = type
      if (Object.keys(patch).length === 0) return err("No fields to update")

      const { data, error } = await supabase
        .from("bento_menu_items")
        .update(patch)
        .eq("id", menu_item_id)
        .select()
        .single()
      if (error) return err(error.message)
      return ok(data)
    }
  )

  server.tool(
    "bento_delete_menu_item",
    "Delete a menu item. Use to drop duplicates or items that got hallucinated during parsing. Does NOT cascade to historical order_items.",
    { menu_item_id: z.string().uuid() },
    async ({ menu_item_id }) => {
      const { error } = await supabase
        .from("bento_menu_items")
        .delete()
        .eq("id", menu_item_id)
      if (error) return err(error.message)
      return ok({ removed: menu_item_id })
    }
  )

  server.tool(
    "bento_update_restaurant",
    "Patch a restaurant (bento_menus) row. Use for fixing a typo in name / phone / google_map_link, or changing the additional options list. Pass only the fields you want to change.",
    {
      restaurant_id: z.string().uuid(),
      name: z.string().min(1).optional(),
      phone: z.string().min(1).optional().describe("Digits only, no dashes."),
      google_map_link: z
        .string()
        .url()
        .nullable()
        .optional()
        .describe("Pass null to clear."),
      additional: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
          "Order-time options for every item. Pass null or [] to clear."
        ),
    },
    async ({ restaurant_id, name, phone, google_map_link, additional }) => {
      const patch: Record<string, unknown> = {}
      if (name !== undefined) patch.name = name
      if (phone !== undefined) patch.phone = phone
      if (google_map_link !== undefined) patch.google_map_link = google_map_link
      if (additional !== undefined)
        patch.additional =
          additional && additional.length > 0 ? additional : null
      if (Object.keys(patch).length === 0) return err("No fields to update")

      const { data, error } = await supabase
        .from("bento_menus")
        .update(patch)
        .eq("id", restaurant_id)
        .select()
        .single()
      if (error) return err(error.message)
      return ok(data)
    }
  )

  server.tool(
    "bento_delete_restaurant",
    "Delete a restaurant (bento_menus row). WARNING: this cascades to menu items and historical orders depending on FK rules — verify with bento_get_order / bento_list_restaurants first. Intended for cleaning up mis-created restaurants, not for retiring ones with real order history.",
    { restaurant_id: z.string().uuid() },
    async ({ restaurant_id }) => {
      const { error } = await supabase
        .from("bento_menus")
        .delete()
        .eq("id", restaurant_id)
      if (error) return err(error.message)
      return ok({ removed: restaurant_id })
    }
  )
}
