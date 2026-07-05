import { describe, expect, it } from "bun:test"

import { computeOrderStats, type StatsOrderItem } from "./order-stats"

function item(overrides: Partial<StatsOrderItem>): StatsOrderItem {
  return {
    menu_item_id: "m1",
    user_id: "u1",
    menu_items: { name: "紅茶", price: 30 },
    ...overrides,
  }
}

describe("computeOrderStats", () => {
  it("returns zeroed result for empty input", () => {
    const result = computeOrderStats([])
    expect(result.userCount).toBe(0)
    expect(result.itemCount).toBe(0)
    expect(result.totalPrice).toBe(0)
    expect(result.menuItems).toEqual([])
  })

  it("tolerates null/undefined order items", () => {
    expect(computeOrderStats(null).itemCount).toBe(0)
    expect(computeOrderStats(undefined).itemCount).toBe(0)
  })

  it("counts unique users, distinguishing anonymous names", () => {
    const result = computeOrderStats([
      item({ user_id: "u1" }),
      item({ user_id: "u1" }),
      item({ user_id: null, anonymous_name: "路人甲" }),
      item({ user_id: null, anonymous_name: "路人乙" }),
    ])
    expect(result.userCount).toBe(3)
    expect(result.itemCount).toBe(4)
  })

  it("folds option price_delta into the total", () => {
    const result = computeOrderStats([
      item({
        menu_items: { name: "奶茶", price: 55 },
        selected_options: [
          { group_name: "甜度", label: "無糖", price_delta: 0 },
          { group_name: "加料", label: "蜜漬白玉丸", price_delta: 10 },
        ],
      }),
    ])
    expect(result.totalPrice).toBe(65)
  })

  it("labels a combination with ' · ' and shows +$N for priced add-ons", () => {
    const result = computeOrderStats([
      item({
        selected_options: [
          { group_name: "甜度", label: "無糖", price_delta: 0 },
          { group_name: "冰量", label: "去冰", price_delta: 0 },
          { group_name: "加料", label: "珍珠", price_delta: 10 },
        ],
      }),
    ])
    expect(result.menuItems[0]!.combinations[0]!.label).toBe(
      "無糖 · 去冰 · 珍珠 +$10"
    )
  })

  it("appends 不醬 and the restaurant additional option to the label", () => {
    const result = computeOrderStats(
      [item({ no_sauce: true, additional: 1 })],
      ["普通", "微辣"]
    )
    expect(result.menuItems[0]!.combinations[0]!.label).toBe("不醬 · 微辣")
  })

  it("groups identical combinations and counts them", () => {
    const result = computeOrderStats([
      item({
        selected_options: [
          { group_name: "甜度", label: "無糖", price_delta: 0 },
        ],
      }),
      item({
        selected_options: [
          { group_name: "甜度", label: "無糖", price_delta: 0 },
        ],
      }),
      item({
        selected_options: [
          { group_name: "甜度", label: "全糖", price_delta: 0 },
        ],
      }),
    ])
    const combos = result.menuItems[0]!.combinations
    expect(combos).toHaveLength(2)
    expect(combos[0]).toMatchObject({ label: "無糖", count: 2 })
    expect(combos[1]).toMatchObject({ label: "全糖", count: 1 })
  })

  it("sorts menu items by count desc, then name asc for ties", () => {
    const result = computeOrderStats([
      item({ menu_item_id: "b", menu_items: { name: "烏龍", price: 30 } }),
      item({ menu_item_id: "a", menu_items: { name: "綠茶", price: 30 } }),
      item({ menu_item_id: "c", menu_items: { name: "多多", price: 40 } }),
      item({ menu_item_id: "c", menu_items: { name: "多多", price: 40 } }),
    ])
    expect(result.menuItems.map((m) => m.name)).toEqual([
      "多多",
      "烏龍",
      "綠茶",
    ])
  })

  it("sorts combinations by count desc, then label asc for ties", () => {
    const mk = (label: string) =>
      item({
        selected_options: [{ group_name: "甜度", label, price_delta: 0 }],
      })
    const result = computeOrderStats([
      mk("全糖"),
      mk("半糖"),
      mk("無糖"),
      mk("無糖"),
    ])
    const combos = result.menuItems[0]!.combinations
    expect(combos.map((c) => c.label)).toEqual(["無糖", "全糖", "半糖"])
  })

  it("drops empty-label combinations (no options at all)", () => {
    const result = computeOrderStats([item({}), item({})])
    expect(result.menuItems[0]!.totalCount).toBe(2)
    expect(result.menuItems[0]!.combinations).toEqual([])
  })

  it("falls back to 未知品項 when menu_items is null", () => {
    const result = computeOrderStats([item({ menu_items: null })])
    expect(result.menuItems[0]!.name).toBe("未知品項")
    expect(result.totalPrice).toBe(0)
  })
})
