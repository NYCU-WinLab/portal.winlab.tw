import { describe, expect, test } from "bun:test"

import { groupMenuItems, sortMenuItemsByType } from "@/lib/bento/menu"

type Item = { name: string; type?: string | null }
type PricedItem = Item & { price: number | string }

describe("groupMenuItems", () => {
  test("groups items by their type", () => {
    const groups = groupMenuItems<Item>([
      { name: "a", type: "主食" },
      { name: "b", type: "飲料" },
      { name: "c", type: "主食" },
    ])
    expect(groups.map((g) => g.type)).toEqual(["主食", "飲料"])
    expect(groups[0]!.items.map((i) => i.name)).toEqual(["a", "c"])
    expect(groups[1]!.items.map((i) => i.name)).toEqual(["b"])
  })

  test("missing, null, or whitespace-only type all fall into 其他", () => {
    const groups = groupMenuItems<Item>([
      { name: "a" },
      { name: "b", type: null },
      { name: "c", type: "   " },
      { name: "d", type: "" },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.type).toBe("其他")
    expect(groups[0]!.items.map((i) => i.name)).toEqual(["a", "b", "c", "d"])
  })

  test("trims surrounding whitespace from the type key", () => {
    const groups = groupMenuItems<Item>([
      { name: "a", type: "  主食  " },
      { name: "b", type: "主食" },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.type).toBe("主食")
  })

  test("pins 其他 last regardless of localeCompare ordering", () => {
    const groups = groupMenuItems<Item>([
      { name: "x", type: "其他" },
      { name: "y", type: "甜點" },
      { name: "z", type: "主食" },
    ])
    expect(groups.map((g) => g.type)).toEqual(["主食", "甜點", "其他"])
  })

  test("orders non-其他 groups by localeCompare", () => {
    const groups = groupMenuItems<Item>([
      { name: "1", type: "banana" },
      { name: "2", type: "apple" },
      { name: "3", type: "cherry" },
    ])
    expect(groups.map((g) => g.type)).toEqual(["apple", "banana", "cherry"])
  })

  test("sorts items inside each group by name via localeCompare", () => {
    const groups = groupMenuItems<Item>([
      { name: "charlie", type: "主食" },
      { name: "alpha", type: "主食" },
      { name: "bravo", type: "主食" },
    ])
    expect(groups[0]!.items.map((i) => i.name)).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ])
  })

  test("does not mutate the input array", () => {
    const input: Item[] = [
      { name: "b", type: "主食" },
      { name: "a", type: "主食" },
    ]
    groupMenuItems(input)
    expect(input.map((i) => i.name)).toEqual(["b", "a"])
  })

  test("returns an empty array for empty input", () => {
    expect(groupMenuItems<Item>([])).toEqual([])
  })
})

describe("sortMenuItemsByType", () => {
  test("orders by type via localeCompare before price", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "a", type: "banana", price: 1 },
      { name: "b", type: "apple", price: 99 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["b", "a"])
  })

  test("sorts by price ascending within the same type", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "expensive", type: "主食", price: 100 },
      { name: "cheap", type: "主食", price: 20 },
      { name: "mid", type: "主食", price: 50 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["cheap", "mid", "expensive"])
  })

  test("places empty/missing-type items after typed items", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "untyped", price: 5 },
      { name: "typed", type: "主食", price: 999 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["typed", "untyped"])
  })

  test("treats whitespace-only type as empty (sorts after typed)", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "blank", type: "   ", price: 1 },
      { name: "typed", type: "z", price: 1 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["typed", "blank"])
  })

  test("compares by price when both types are empty", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "hi", price: 80 },
      { name: "lo", price: 10 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["lo", "hi"])
  })

  test("parses numeric string prices for comparison", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "a", type: "主食", price: "100" },
      { name: "b", type: "主食", price: "20" },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["b", "a"])
  })

  test("parseFloat reads the leading number of a mixed string price", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "a", type: "主食", price: "12.5元" },
      { name: "b", type: "主食", price: "3元" },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["b", "a"])
  })

  test("falls back to 0 for an unparseable string price", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "garbage", type: "主食", price: "free" },
      { name: "paid", type: "主食", price: 5 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["garbage", "paid"])
  })

  test("does not pin 其他 last (unlike groupMenuItems)", () => {
    const sorted = sortMenuItemsByType<PricedItem>([
      { name: "other-item", type: "其他", price: 1 },
      { name: "main-item", type: "甜點", price: 1 },
    ])
    expect(sorted.map((i) => i.name)).toEqual(["other-item", "main-item"])
  })

  test("does not mutate the input array", () => {
    const input: PricedItem[] = [
      { name: "b", type: "主食", price: 99 },
      { name: "a", type: "主食", price: 1 },
    ]
    sortMenuItemsByType(input)
    expect(input.map((i) => i.name)).toEqual(["b", "a"])
  })

  test("returns an empty array for empty input", () => {
    expect(sortMenuItemsByType<PricedItem>([])).toEqual([])
  })
})
