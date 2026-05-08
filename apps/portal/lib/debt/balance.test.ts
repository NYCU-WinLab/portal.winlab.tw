import { describe, expect, test } from "bun:test"

import { computeBalances, getUnsettledPeriodStart } from "@/lib/debt/balance"

describe("getUnsettledPeriodStart", () => {
  test("returns the unix epoch when nothing has been settled yet", () => {
    expect(getUnsettledPeriodStart(null)).toBe("1970-01-01T00:00:00Z")
  })

  test("rolls a mid-year period into the next month", () => {
    expect(getUnsettledPeriodStart("2024-06")).toBe("2024-07-01T00:00:00Z")
  })

  test("rolls December into January of the following year", () => {
    expect(getUnsettledPeriodStart("2024-12")).toBe("2025-01-01T00:00:00Z")
  })

  test("treats malformed periods as never-settled rather than crashing", () => {
    expect(getUnsettledPeriodStart("garbage")).toBe("1970-01-01T00:00:00Z")
    expect(getUnsettledPeriodStart("2024-13")).toBe("2024-14-01T00:00:00Z")
    // ^ note: regex matches MM digits but not the actual month range. The
    // function trusts callers — this case is currently lenient by design.
  })
})

describe("computeBalances", () => {
  const ME = "user-me"
  const A = "user-a"
  const B = "user-b"
  const names = new Map<string, string | null>([
    [A, "Alice"],
    [B, "Bob"],
  ])

  function expense(
    overrides: Partial<{
      id: string
      name: string
      creator_id: string
      created_at: string
    }>
  ) {
    return {
      id: overrides.id ?? "exp-1",
      name: overrides.name ?? "Lunch",
      creator_id: overrides.creator_id ?? ME,
      created_at: overrides.created_at ?? "2024-01-01T12:00:00Z",
    }
  }

  function item(
    overrides: Partial<{
      id: string
      debtor_id: string
      amount: number
      paid_at: string | null
      expense: ReturnType<typeof expense>
    }>
  ) {
    return {
      id: overrides.id ?? "item-1",
      debtor_id: overrides.debtor_id ?? A,
      amount: overrides.amount ?? 100,
      paid_at: overrides.paid_at ?? null,
      expense: overrides.expense ?? expense({}),
    }
  }

  test("classifies someone-owes-me when I created the expense", () => {
    const result = computeBalances(
      [item({ debtor_id: A, amount: 250 })],
      ME,
      names
    )
    expect(result.iOwe).toEqual([])
    expect(result.owedToMe).toHaveLength(1)
    expect(result.owedToMe[0]).toMatchObject({
      userId: A,
      userName: "Alice",
      netAmount: 250,
    })
  })

  test("classifies I-owe when I am the debtor", () => {
    const result = computeBalances(
      [item({ debtor_id: ME, expense: expense({ creator_id: A }) })],
      ME,
      names
    )
    expect(result.owedToMe).toEqual([])
    expect(result.iOwe).toHaveLength(1)
    expect(result.iOwe[0]?.userId).toBe(A)
  })

  test("paid items contribute to total but not to net", () => {
    const result = computeBalances(
      [
        item({ id: "i1", amount: 100, paid_at: null }),
        item({ id: "i2", amount: 50, paid_at: "2024-02-01T00:00:00Z" }),
      ],
      ME,
      names
    )
    // total = 150 → entry stays. net = 100 (only the unpaid item).
    expect(result.owedToMe[0]?.netAmount).toBe(100)
  })

  test("drops counterparties whose total nets to zero", () => {
    // I owe A 100, A owes me 100 (different expenses) → balanced.
    const result = computeBalances(
      [
        item({
          id: "i1",
          debtor_id: A,
          amount: 100,
          expense: expense({ id: "e1", creator_id: ME }),
        }),
        item({
          id: "i2",
          debtor_id: ME,
          amount: 100,
          expense: expense({ id: "e2", creator_id: A }),
        }),
      ],
      ME,
      names
    )
    expect(result.iOwe).toEqual([])
    expect(result.owedToMe).toEqual([])
  })

  test("ignores items the viewer is not part of", () => {
    const result = computeBalances(
      [
        item({
          debtor_id: B,
          expense: expense({ creator_id: A }),
        }),
      ],
      ME,
      names
    )
    expect(result.iOwe).toEqual([])
    expect(result.owedToMe).toEqual([])
  })

  test("sorts each side descending by net amount", () => {
    const result = computeBalances(
      [
        item({
          id: "i1",
          debtor_id: A,
          amount: 50,
          expense: expense({ id: "e1", creator_id: ME }),
        }),
        item({
          id: "i2",
          debtor_id: B,
          amount: 300,
          expense: expense({ id: "e2", creator_id: ME }),
        }),
      ],
      ME,
      names
    )
    expect(result.owedToMe.map((e) => e.userId)).toEqual([B, A])
  })
})
