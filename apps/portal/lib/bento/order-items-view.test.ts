import { describe, expect, it } from "bun:test"

import {
  formatItemTime,
  groupByPerson,
  itemPrice,
  sortByTime,
  type ViewOrderItem,
} from "./order-items-view"

function item(overrides: Partial<ViewOrderItem>): ViewOrderItem {
  return {
    id: "i1",
    created_at: "2026-07-06T06:00:00Z",
    menu_item_id: "m1",
    no_sauce: false,
    additional: null,
    user_id: "u1",
    menu_items: { name: "紅茶", price: 30 },
    user: { name: "王小明" },
    ...overrides,
  }
}

describe("itemPrice", () => {
  it("adds option price_delta to the menu price", () => {
    expect(
      itemPrice(
        item({
          menu_items: { name: "奶茶", price: 55 },
          selected_options: [
            { group_name: "加料", label: "珍珠", price_delta: 10 },
          ],
        })
      )
    ).toBe(65)
  })

  it("treats a null menu_items as 0", () => {
    expect(itemPrice(item({ menu_items: null }))).toBe(0)
  })
})

describe("groupByPerson", () => {
  it("groups items by user and sums each person's spend", () => {
    const groups = groupByPerson([
      item({ id: "a", user_id: "u1", menu_items: { name: "紅茶", price: 30 } }),
      item({ id: "b", user_id: "u1", menu_items: { name: "奶茶", price: 50 } }),
      item({ id: "c", user_id: "u2", menu_items: { name: "綠茶", price: 40 } }),
    ])
    expect(groups).toHaveLength(2)
    const u1 = groups.find((g) => g.key === "u1")!
    expect(u1.items).toHaveLength(2)
    expect(u1.total).toBe(80)
  })

  it("keys anonymous items by name and reads their contact", () => {
    const groups = groupByPerson([
      item({
        user_id: null,
        user: null,
        anonymous_name: "路人",
        anonymous_contact: "0912",
      }),
    ])
    expect(groups[0]!.key).toBe("anon:路人")
    expect(groups[0]!.userName).toBe("路人")
    expect(groups[0]!.contact).toBe("0912")
  })

  it("pins the current user first, then orders by spend desc", () => {
    const groups = groupByPerson(
      [
        item({
          id: "a",
          user_id: "u1",
          menu_items: { name: "紅茶", price: 30 },
        }),
        item({
          id: "b",
          user_id: "u2",
          menu_items: { name: "奶茶", price: 90 },
        }),
        item({
          id: "c",
          user_id: "u3",
          menu_items: { name: "綠茶", price: 60 },
        }),
      ],
      "u1"
    )
    expect(groups.map((g) => g.key)).toEqual(["u1", "u2", "u3"])
  })

  it("orders items within a group chronologically", () => {
    const groups = groupByPerson([
      item({ id: "late", created_at: "2026-07-06T08:00:00Z" }),
      item({ id: "early", created_at: "2026-07-06T06:00:00Z" }),
    ])
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["early", "late"])
  })
})

describe("sortByTime", () => {
  const items = [
    item({ id: "mid", created_at: "2026-07-06T07:00:00Z" }),
    item({ id: "early", created_at: "2026-07-06T06:00:00Z" }),
    item({ id: "late", created_at: "2026-07-06T08:00:00Z" }),
  ]

  it("sorts ascending by default", () => {
    expect(sortByTime(items).map((i) => i.id)).toEqual(["early", "mid", "late"])
  })

  it("sorts descending when asked", () => {
    expect(sortByTime(items, "desc").map((i) => i.id)).toEqual([
      "late",
      "mid",
      "early",
    ])
  })

  it("does not mutate the input array", () => {
    const original = items.map((i) => i.id)
    sortByTime(items)
    expect(items.map((i) => i.id)).toEqual(original)
  })
})

describe("formatItemTime", () => {
  it("formats a UTC timestamp as HH:mm in Taipei time (+8)", () => {
    expect(formatItemTime("2026-07-06T06:23:00Z")).toBe("14:23")
  })

  it("returns an empty string for an invalid date", () => {
    expect(formatItemTime("not-a-date")).toBe("")
  })
})
