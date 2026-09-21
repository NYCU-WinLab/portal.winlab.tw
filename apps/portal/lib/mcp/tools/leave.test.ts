import { describe, expect, test } from "bun:test"

import type { LeaveWithUser } from "@/lib/leave/types"
import { groupLeavesByDate, leaveRange } from "@/lib/mcp/tools/leave"

function leave(date: string, name: string, reason = "有事"): LeaveWithUser {
  return {
    id: `${date}-${name}`,
    user_id: `user-${name}`,
    date,
    reason,
    created_at: `${date}T02:00:00.000Z`,
    updated_at: `${date}T02:00:00.000Z`,
    user: { name },
  }
}

describe("leaveRange", () => {
  test("defaults to today onwards with no upper bound", () => {
    expect(leaveRange({}, "2026-09-21")).toEqual({
      from: "2026-09-21",
      to: null,
    })
  })

  test("keeps the bounds the caller asked for", () => {
    expect(
      leaveRange({ from: "2026-01-05", to: "2026-02-02" }, "2026-09-21")
    ).toEqual({ from: "2026-01-05", to: "2026-02-02" })
  })

  test("a lone from does not gain an upper bound", () => {
    expect(leaveRange({ from: "2026-01-05" }, "2026-09-21").to).toBeNull()
  })

  test("a lone to still starts from today", () => {
    expect(leaveRange({ to: "2026-12-28" }, "2026-09-21").from).toBe(
      "2026-09-21"
    )
  })
})

describe("groupLeavesByDate", () => {
  const leaves = [
    leave("2026-09-28", "Bob", "出國"),
    leave("2026-09-21", "Ann"),
    leave("2026-09-21", "Cid", "看醫生"),
    leave("2026-09-14", "Dan"),
  ]

  test("groups by meeting date in calendar order", () => {
    const groups = groupLeavesByDate(leaves, {
      from: "2026-09-01",
      to: null,
    })
    expect(groups.map((g) => g.date)).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ])
    expect(groups[1]?.count).toBe(2)
    expect(groups[1]?.people.map((p) => p.name)).toEqual(["Ann", "Cid"])
    expect(groups[1]?.people[1]?.reason).toBe("看醫生")
  })

  test("labels the date the way the leave page shows it", () => {
    const [first] = groupLeavesByDate(leaves, { from: "2026-09-14", to: null })
    expect(first?.date_label).toBe("2026/09/14")
  })

  test("drops dates before from and after to, both inclusive", () => {
    const groups = groupLeavesByDate(leaves, {
      from: "2026-09-21",
      to: "2026-09-21",
    })
    expect(groups.map((g) => g.date)).toEqual(["2026-09-21"])
  })

  test("returns nothing when the range has no sign-ups", () => {
    expect(groupLeavesByDate(leaves, { from: "2026-10-01", to: null })).toEqual(
      []
    )
  })
})
