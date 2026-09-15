import { describe, expect, it } from "bun:test"

import {
  defaultScheduleYear,
  maxNavigableYear,
  type ScheduleYearBounds,
} from "./schedule-year"

describe("defaultScheduleYear", () => {
  it("opens the year holding the next meeting", () => {
    expect(
      defaultScheduleYear(
        { upcomingDate: "2026-12-07", latestDate: "2027-02-15" },
        2026
      )
    ).toBe(2026)
  })

  it("opens 2027 on new year's day 2027, because that is where the next meeting is", () => {
    expect(
      defaultScheduleYear(
        { upcomingDate: "2027-01-04", latestDate: "2027-02-15" },
        2027
      )
    ).toBe(2027)
  })

  it("opens next year while it's still this year on the clock, because the next meeting already fell into January", () => {
    // The real shape of the bug this function exists to fix: it's still
    // December 2026 by the clock, but the next meeting is 2027-01-04, so the
    // page must open on 2027, not 2026.
    expect(
      defaultScheduleYear(
        { upcomingDate: "2027-01-04", latestDate: "2027-02-15" },
        2026
      )
    ).toBe(2027)
  })

  it("falls back to the last row's year when every meeting is in the past", () => {
    expect(
      defaultScheduleYear(
        { upcomingDate: null, latestDate: "2026-09-07" },
        2028
      )
    ).toBe(2026)
  })

  it("falls back to the calendar year on an empty table", () => {
    expect(
      defaultScheduleYear({ upcomingDate: null, latestDate: null }, 2029)
    ).toBe(2029)
  })
})

describe("maxNavigableYear", () => {
  it("always allows one year past the calendar year, so next year can be generated", () => {
    expect(
      maxNavigableYear(
        { upcomingDate: "2026-12-07", latestDate: "2026-12-07" },
        2026
      )
    ).toBe(2027)
  })

  it("allows one year past the data when the schedule runs ahead of the clock", () => {
    expect(
      maxNavigableYear(
        { upcomingDate: "2026-12-07", latestDate: "2027-02-15" },
        2026
      )
    ).toBe(2028)
  })

  it("never falls behind the calendar year when the schedule is stale", () => {
    // The opposite direction: the data is old (every meeting is in the
    // past), but the arrow must still reach one past TODAY, not one past
    // whatever year the last stale row happens to sit in.
    expect(
      maxNavigableYear({ upcomingDate: null, latestDate: "2026-09-07" }, 2028)
    ).toBe(2029)
  })

  it("never falls behind the calendar year when the table is empty", () => {
    expect(
      maxNavigableYear({ upcomingDate: null, latestDate: null }, 2030)
    ).toBe(2031)
  })

  it("is always reachable from the default year", () => {
    // Guards the actual regression: the forward arrow must never be disabled at
    // the year the page opens on, or next year is unreachable.
    const cases: Array<[ScheduleYearBounds, number]> = [
      [{ upcomingDate: "2026-12-07", latestDate: "2026-12-07" }, 2026],
      [{ upcomingDate: "2026-12-07", latestDate: "2027-02-15" }, 2027],
      [{ upcomingDate: "2027-01-04", latestDate: "2027-02-15" }, 2026],
      [{ upcomingDate: null, latestDate: "2026-09-07" }, 2028],
      [{ upcomingDate: null, latestDate: null }, 2029],
    ]
    for (const [bounds, calendarYear] of cases) {
      expect(maxNavigableYear(bounds, calendarYear)).toBeGreaterThan(
        defaultScheduleYear(bounds, calendarYear)
      )
    }
  })
})
