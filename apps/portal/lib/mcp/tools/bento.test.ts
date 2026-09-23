import { describe, expect, test } from "bun:test"

import type { ViewOrderItem } from "@/lib/bento/order-items-view"
import { rollUpOrderItems } from "@/lib/mcp/tools/bento"

function item(
  id: string,
  price: number,
  who: { userId: string | null; name: string | null; anonymous?: string },
  options: { group_name: string; label: string; price_delta: number }[] = []
): ViewOrderItem {
  return {
    id,
    created_at: `2026-09-21T0${id}:00:00.000Z`,
    menu_item_id: `menu-${id}`,
    no_sauce: false,
    additional: null,
    user_id: who.userId,
    anonymous_name: who.anonymous ?? null,
    menu_items: { name: `item ${id}`, price },
    user: who.name ? { name: who.name } : null,
    selected_options: options,
  }
}

describe("rollUpOrderItems", () => {
  const items = [
    item("1", 80, { userId: "u1", name: "Ann" }),
    item("2", 60, { userId: "u1", name: "Ann" }, [
      { group_name: "甜度", label: "半糖", price_delta: 5 },
    ]),
    item("3", 100, { userId: "u2", name: "Bob" }),
  ]

  test("counts items and the people behind them", () => {
    const rollUp = rollUpOrderItems(items)
    expect(rollUp.item_count).toBe(3)
    expect(rollUp.person_count).toBe(2)
  })

  test("adds option price deltas into every total", () => {
    const rollUp = rollUpOrderItems(items)
    expect(rollUp.total_price).toBe(245)
    expect(rollUp.by_person[0]).toEqual({
      user_id: "u1",
      name: "Ann",
      item_count: 2,
      total_price: 145,
    })
  })

  test("orders people by what they spend", () => {
    const rollUp = rollUpOrderItems(items)
    expect(rollUp.by_person.map((p) => p.name)).toEqual(["Ann", "Bob"])
  })

  test("keeps a guest line under the name they typed", () => {
    const rollUp = rollUpOrderItems([
      item("4", 90, { userId: null, name: null, anonymous: "訪客" }),
    ])
    expect(rollUp.by_person).toEqual([
      { user_id: null, name: "訪客", item_count: 1, total_price: 90 },
    ])
  })

  test("an empty order rolls up to zeroes", () => {
    expect(rollUpOrderItems([])).toEqual({
      item_count: 0,
      person_count: 0,
      total_price: 0,
      by_person: [],
    })
  })
})
