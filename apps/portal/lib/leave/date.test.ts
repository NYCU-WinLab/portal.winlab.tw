import { describe, expect, test } from "bun:test"

import {
  formatLeaveDate,
  getNextMondays,
  parseLocalDate,
  toIsoDate,
} from "@/lib/leave/date"

describe("parseLocalDate", () => {
  test("returns local midnight of the requested ISO date", () => {
    const d = parseLocalDate("2024-01-15")
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
    expect(d.getHours()).toBe(0)
  })
})

describe("formatLeaveDate", () => {
  test("renders the slash-separated calendar form", () => {
    expect(formatLeaveDate("2024-01-15")).toBe("2024/01/15")
    expect(formatLeaveDate("2024-12-31")).toBe("2024/12/31")
  })
})

describe("toIsoDate", () => {
  test("round-trips with parseLocalDate", () => {
    const original = "2024-09-09"
    expect(toIsoDate(parseLocalDate(original))).toBe(original)
  })
})

describe("getNextMondays", () => {
  function makeLocal(year: number, monthIndex: number, day: number) {
    return new Date(year, monthIndex, day)
  }

  test("if today is a Sunday, the first Monday is tomorrow", () => {
    // 2024-01-07 is a Sunday.
    const sunday = makeLocal(2024, 0, 7)
    const [first] = getNextMondays(1, sunday)
    expect(first?.getFullYear()).toBe(2024)
    expect(first?.getMonth()).toBe(0)
    expect(first?.getDate()).toBe(8)
  })

  test("if today is a Monday, the first Monday is today", () => {
    const monday = makeLocal(2024, 0, 8)
    const [first] = getNextMondays(1, monday)
    expect(first?.getDate()).toBe(8)
  })

  test("if today is a Wednesday, the first Monday is five days later", () => {
    // 2024-01-10 is a Wednesday.
    const wednesday = makeLocal(2024, 0, 10)
    const [first] = getNextMondays(1, wednesday)
    expect(first?.getDate()).toBe(15)
  })

  test("returns N consecutive Mondays seven days apart", () => {
    const monday = makeLocal(2024, 0, 8)
    const list = getNextMondays(4, monday)
    expect(list.map((d) => d.getDate())).toEqual([8, 15, 22, 29])
  })

  test("rolls into the next month correctly", () => {
    // Last Monday of January 2024 is the 29th. Next Monday is Feb 5.
    const lastMonday = makeLocal(2024, 0, 29)
    const list = getNextMondays(2, lastMonday)
    expect(list[0]?.getMonth()).toBe(0)
    expect(list[0]?.getDate()).toBe(29)
    expect(list[1]?.getMonth()).toBe(1)
    expect(list[1]?.getDate()).toBe(5)
  })
})
