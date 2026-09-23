import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { formatOrderDate } from "@/lib/bento/date"
import {
  fetchMenuItems,
  fetchOptionGroups,
  fetchOrder,
  fetchOrders,
} from "@/lib/bento/fetch"
import {
  addOrderItemWithOptions,
  deleteOrderItem,
} from "@/lib/bento/order-items"
import {
  groupByPerson,
  itemPersonName,
  itemPrice,
  type ViewOrderItem,
} from "@/lib/bento/order-items-view"
import type { Order } from "@/lib/bento/types"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

const ORDER_STATUSES = ["active", "closed"] as const

export interface OrderRollUp {
  item_count: number
  person_count: number
  total_price: number
  by_person: Array<{
    user_id: string | null
    name: string
    item_count: number
    total_price: number
  }>
}

// Per-person totals for one order, built on the same grouping the web order
// page shows, so an agent quoting "you owe 120" matches the screen.
export function rollUpOrderItems(items: ViewOrderItem[]): OrderRollUp {
  const groups = groupByPerson(items)
  return {
    item_count: items.length,
    person_count: groups.length,
    total_price: items.reduce((sum, item) => sum + itemPrice(item), 0),
    by_person: groups.map((group) => ({
      user_id: group.userId,
      name: group.userName ?? "未知",
      item_count: group.items.length,
      total_price: group.total,
    })),
  }
}

function orderUrl(orderId: string): string {
  return `${PORTAL_URL}/bento/orders/${orderId}`
}

function additionalLabels(order: Order): string[] {
  const additional = order.restaurants?.additional
  return Array.isArray(additional) ? additional : []
}

function describeItem(item: ViewOrderItem, labels: string[]) {
  return {
    id: item.id,
    menu_item_id: item.menu_item_id,
    name: item.menu_items?.name ?? null,
    price: itemPrice(item),
    base_price: item.menu_items?.price ?? 0,
    options: (item.selected_options ?? []).map((option) => ({
      group_name: option.group_name,
      label: option.label,
      price_delta: option.price_delta,
    })),
    no_sauce: item.no_sauce,
    additional_label:
      item.additional !== null && item.additional !== undefined
        ? (labels[item.additional] ?? null)
        : null,
    ordered_by: itemPersonName(item),
    ordered_by_user_id: item.user_id,
    created_at: item.created_at,
  }
}

function isMissingRow(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "PGRST116"
  )
}

async function loadOrder(
  supabase: ReturnType<typeof createUserClient>,
  orderId: string
): Promise<Order> {
  try {
    return await fetchOrder(supabase, orderId)
  } catch (err) {
    if (isMissingRow(err)) {
      throw new Error(
        `no bento order with id ${orderId}; call list_bento_orders for the ids`,
        { cause: err }
      )
    }
    throw err
  }
}

export function registerBentoTools(server: McpServer) {
  server.registerTool(
    "list_bento_orders",
    {
      title: "List bento orders",
      description:
        "Lunch orders on /bento, newest first, with the restaurant, how many people ordered, how many items and what the whole order costs. Every member sees every order and its totals. status 'active' means the order is still open for items, 'closed' means it has been sent to the restaurant; auto_close_at is the deadline when one is set. Pass an id to get_bento_order to see the menu and who ordered what.",
      inputSchema: z.object({
        status: z
          .enum(ORDER_STATUSES)
          .optional()
          .describe("Only open ('active') or only closed orders"),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async ({ status, limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const orders = await fetchOrders(supabase)
        const rows = orders
          .filter((order) => !status || order.status === status)
          .slice(0, limit)
          .map((order) => ({
            id: order.id,
            order_date: order.order_date ?? null,
            order_date_label: formatOrderDate(order.order_date, order.id),
            restaurant: order.restaurants?.name ?? null,
            status: order.status,
            created_at: order.created_at,
            closed_at: order.closed_at,
            auto_close_at: order.auto_close_at ?? null,
            person_count: order.stats.user_count,
            item_count: order.stats.total_items,
            total_price: order.stats.total_price,
            url: orderUrl(order.id),
          }))
        return json({ count: rows.length, orders: rows })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "get_bento_order",
    {
      title: "Get bento order",
      description:
        "One lunch order on /bento in full: the restaurant, its menu with prices, the restaurant's option groups (甜度, 冰量, ... — they apply to every item of that menu, and a group with required=true must be answered), every line already ordered with who ordered it and what it costs, plus per-person totals. Every member sees the whole order. Read this before add_bento_order_item: it carries the menu_item_id and option value ids that tool needs.",
      inputSchema: z.object({
        order_id: z
          .string()
          .trim()
          .min(1)
          .describe("Order id from list_bento_orders, e.g. '20260702'"),
      }),
    },
    async ({ order_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const order = await loadOrder(supabase, order_id)
        const restaurant = order.restaurants
        const [menuItems, optionGroups] = await Promise.all([
          fetchMenuItems(supabase, order.restaurant_id),
          fetchOptionGroups(supabase, order.restaurant_id),
        ])
        const items = (order.order_items ?? []) as ViewOrderItem[]
        const labels = additionalLabels(order)
        const rollUp = rollUpOrderItems(items)
        return json({
          order: {
            id: order.id,
            order_date: order.order_date ?? null,
            order_date_label: formatOrderDate(order.order_date, order.id),
            status: order.status,
            created_at: order.created_at,
            closed_at: order.closed_at,
            auto_close_at: order.auto_close_at ?? null,
            url: orderUrl(order.id),
          },
          restaurant: {
            id: restaurant?.id ?? order.restaurant_id,
            name: restaurant?.name ?? null,
            phone: restaurant?.phone ?? null,
            kind: restaurant?.kind ?? null,
            additional_labels: labels,
          },
          menu: {
            items: menuItems.map((item) => ({
              id: item.id,
              name: item.name,
              price: item.price,
              type: item.type,
            })),
            option_groups: optionGroups.map((group) => ({
              id: group.id,
              name: group.name,
              required: group.required,
              single_select: group.single_select,
              values: group.values.map((value) => ({
                id: value.id,
                label: value.label,
                price_delta: value.price_delta,
              })),
            })),
          },
          totals: {
            item_count: rollUp.item_count,
            person_count: rollUp.person_count,
            total_price: rollUp.total_price,
          },
          by_person: rollUp.by_person,
          items: items.map((item) => describeItem(item, labels)),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "add_bento_order_item",
    {
      title: "Add bento order item",
      description:
        "Orders one menu item for the signed-in member on an open bento order (/bento), through the same RPC the web form uses: it refuses a closed order, an item from another restaurant, and any option group the menu marks required (甜度, 冰量, ...) that is left unanswered. Call get_bento_order first for the menu_item_id and the option_value_ids, and confirm the item and every option with the member before calling — this commits them to paying for it, and only remove_bento_order_item undoes it. A member can order only for themselves; ordering for someone else stays in the web app.",
      inputSchema: z.object({
        order_id: z
          .string()
          .trim()
          .min(1)
          .describe("Order id from list_bento_orders, e.g. '20260702'"),
        menu_item_id: z
          .uuid()
          .describe("Menu item id from get_bento_order's menu.items"),
        option_value_ids: z
          .array(z.uuid())
          .default([])
          .describe(
            "Chosen option value ids, one per required group at minimum"
          ),
        no_sauce: z
          .boolean()
          .default(false)
          .describe("不加醬, for meal restaurants that ask"),
      }),
    },
    async ({ order_id, menu_item_id, option_value_ids, no_sauce }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const added = await addOrderItemWithOptions(supabase, {
          order_id,
          menu_item_id,
          option_value_ids,
          no_sauce,
        })
        const order = await loadOrder(supabase, order_id)
        const items = (order.order_items ?? []) as ViewOrderItem[]
        const labels = additionalLabels(order)
        const item = items.find((candidate) => candidate.id === added.id)
        const mine = items.filter((line) => line.user_id === caller.userId)
        return json({
          added: item
            ? describeItem(item, labels)
            : { id: added.id, menu_item_id: added.menu_item_id },
          your_item_count: mine.length,
          your_total_price: mine.reduce(
            (sum, line) => sum + itemPrice(line),
            0
          ),
          order: {
            id: order.id,
            restaurant: order.restaurants?.name ?? null,
            status: order.status,
            url: orderUrl(order.id),
          },
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "remove_bento_order_item",
    {
      title: "Remove bento order item",
      description:
        "Deletes one of the member's own lines from a bento order (/bento). This tool only ever removes the caller's own lines: someone else's line is refused even when the caller is a bento admin, who can still do that on the web page. Deleting cannot be undone, so confirm with the member which line to drop before calling. item_id comes from get_bento_order's items[].id.",
      inputSchema: z.object({
        item_id: z.uuid().describe("Order item id from get_bento_order"),
      }),
    },
    async ({ item_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const deleted = await deleteOrderItem(supabase, item_id, {
          ownerId: caller.userId,
        })
        if (deleted === 0) {
          throw new Error(
            `nothing was deleted: order item ${item_id} either does not exist or belongs to another member, and only its owner may remove it`
          )
        }
        return json({ removed: true, item_id })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
