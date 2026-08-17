import { describe, expect, it } from "bun:test"

import {
  defaultScheduleYear,
  maxNavigableYear,
  type ScheduleYearBounds,
} from "./schedule-year"

describe("defaultScheduleYear", () => {
  it("opens the bucket holding the next meeting", () => {
    expect(defaultScheduleYear({ upcoming: 2026, latest: 2026 }, 2026)).toBe(
      2026
    )
  })

  it("opens 2026 on new year's day 2027, because that is where 2027-01-04 lives", () => {
    // The real shape of the bug: the 2026 bucket runs to 2027-01-04, so on
    // 2027-01-01 the calendar year is 2027 but the next meeting is in 2026.
    expect(defaultScheduleYear({ upcoming: 2026, latest: 2027 }, 2027)).toBe(
      2026
    )
  })

  it("falls back to the last bucket when every meeting is in the past", () => {
    expect(defaultScheduleYear({ upcoming: null, latest: 2026 }, 2028)).toBe(
      2026
    )
  })

  it("falls back to the calendar year on an empty table", () => {
    expect(defaultScheduleYear({ upcoming: null, latest: null }, 2029)).toBe(
      2029
    )
  })
})

describe("maxNavigableYear", () => {
  it("always allows one year past the calendar year, so next year can be generated", () => {
    expect(maxNavigableYear({ upcoming: 2026, latest: 2026 }, 2026)).toBe(2027)
  })

  it("allows one year past the data when the schedule runs ahead of the clock", () => {
    expect(maxNavigableYear({ upcoming: 2026, latest: 2027 }, 2026)).toBe(2028)
  })

  it("never falls behind the calendar year when the table is empty", () => {
    expect(maxNavigableYear({ upcoming: null, latest: null }, 2030)).toBe(2031)
  })

  it("is always reachable from the default year", () => {
    // Guards the actual regression: the forward arrow must never be disabled at
    // the year the page opens on, or next year is unreachable.
    const cases: Array<[ScheduleYearBounds, number]> = [
      [{ upcoming: 2026, latest: 2026 }, 2026],
      [{ upcoming: 2026, latest: 2027 }, 2027],
      [{ upcoming: null, latest: 2026 }, 2028],
      [{ upcoming: null, latest: null }, 2029],
    ]
    for (const [bounds, calendarYear] of cases) {
      expect(maxNavigableYear(bounds, calendarYear)).toBeGreaterThan(
        defaultScheduleYear(bounds, calendarYear)
      )
    }
  })
})
