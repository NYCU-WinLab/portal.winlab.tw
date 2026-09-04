import { describe, expect, test } from "bun:test"

import {
  endTimeOf,
  nextOccurrenceOnOrAfter,
  nextWeekdayOnOrAfter,
  occurrencesBetween,
  occursOn,
  weekdayOf,
} from "./recurrence"

// 2026-08-03 is a Monday.
const MONDAY = "2026-08-03"

describe("weekdayOf", () => {
  test("reads the weekday in Asia/Taipei, not UTC", () => {
    expect(weekdayOf(MONDAY)).toBe(1)
    expect(weekdayOf("2026-08-09")).toBe(0)
  })
})

describe("occursOn — weekly", () => {
  const weekly = { weekday: 1, intervalWeeks: 1, anchorDate: MONDAY }

  test("every matching weekday counts", () => {
    expect(occursOn(weekly, MONDAY)).toBe(true)
    expect(occursOn(weekly, "2026-08-10")).toBe(true)
    expect(occursOn(weekly, "2026-08-17")).toBe(true)
  })

  test("other weekdays never do", () => {
    expect(occursOn(weekly, "2026-08-04")).toBe(false)
  })
})

describe("occursOn — fortnightly", () => {
  const fortnightly = { weekday: 1, intervalWeeks: 2, anchorDate: MONDAY }

  test("lands on the anchor and every second week after", () => {
    expect(occursOn(fortnightly, MONDAY)).toBe(true)
    expect(occursOn(fortnightly, "2026-08-17")).toBe(true)
    expect(occursOn(fortnightly, "2026-08-31")).toBe(true)
  })

  test("skips the weeks in between", () => {
    expect(occursOn(fortnightly, "2026-08-10")).toBe(false)
    expect(occursOn(fortnightly, "2026-08-24")).toBe(false)
  })

  test("keeps the same alternation before the anchor", () => {
    // The phase must not flip for earlier dates — flooring, not truncation.
    expect(occursOn(fortnightly, "2026-07-20")).toBe(true)
    expect(occursOn(fortnightly, "2026-07-27")).toBe(false)
  })

  test("still requires the right weekday", () => {
    expect(occursOn(fortnightly, "2026-08-18")).toBe(false)
  })
})

describe("endTimeOf", () => {
  test("adds a duration within the hour", () => {
    expect(endTimeOf("09:00", 30)).toBe("09:30")
  })

  test("carries into the next hour", () => {
    expect(endTimeOf("09:30", 90)).toBe("11:00")
  })

  test("pads single-digit hours", () => {
    expect(endTimeOf("08:00", 60)).toBe("09:00")
  })
})

describe("nextWeekdayOnOrAfter", () => {
  test("returns the date itself when it already matches", () => {
    expect(nextWeekdayOnOrAfter(MONDAY, 1)).toBe(MONDAY)
  })

  test("moves forward to the next matching weekday", () => {
    // Monday -> the following Wednesday.
    expect(nextWeekdayOnOrAfter(MONDAY, 3)).toBe("2026-08-05")
  })

  test("wraps into the next week when the weekday has passed", () => {
    // Wednesday -> the following Monday, not the one just gone.
    expect(nextWeekdayOnOrAfter("2026-08-05", 1)).toBe("2026-08-10")
  })
})

describe("nextOccurrenceOnOrAfter", () => {
  // 2026-09-04 is a Friday, 09-08 a Tuesday.
  const weekly = { weekday: 5, intervalWeeks: 1, anchorDate: "2026-09-04" }
  const fortnightly = { weekday: 2, intervalWeeks: 2, anchorDate: "2026-09-08" }

  test("returns the date itself when the series meets that day", () => {
    expect(nextOccurrenceOnOrAfter(weekly, "2026-09-04")).toBe("2026-09-04")
  })

  test("walks forward to the next meeting day", () => {
    expect(nextOccurrenceOnOrAfter(weekly, "2026-09-05")).toBe("2026-09-11")
  })

  // The weekday alone is not the answer for a fortnightly series: 09-15 is a
  // Tuesday but an off week, so the next real occurrence is 09-22.
  test("respects the fortnightly phase, not just the weekday", () => {
    expect(nextOccurrenceOnOrAfter(fortnightly, "2026-09-09")).toBe(
      "2026-09-22"
    )
    expect(nextOccurrenceOnOrAfter(fortnightly, "2026-09-08")).toBe(
      "2026-09-08"
    )
  })
})

describe("occurrencesBetween", () => {
  const weekly = { weekday: 5, intervalWeeks: 1, anchorDate: "2026-09-04" }
  const fortnightly = { weekday: 2, intervalWeeks: 2, anchorDate: "2026-09-08" }

  // The catch-up window a newly created series needs: tomorrow through the
  // cron's lead day, inclusive at both ends.
  test("lists every meeting day in the window", () => {
    expect(occurrencesBetween(weekly, "2026-09-04", "2026-09-11")).toEqual([
      "2026-09-04",
      "2026-09-11",
    ])
  })

  test("skips the off week of a fortnightly series", () => {
    expect(occurrencesBetween(fortnightly, "2026-09-04", "2026-09-18")).toEqual(
      ["2026-09-08"]
    )
  })

  test("a window with no meeting day is empty, not an error", () => {
    expect(occurrencesBetween(weekly, "2026-09-05", "2026-09-10")).toEqual([])
  })

  test("a reversed window is empty", () => {
    expect(occurrencesBetween(weekly, "2026-09-11", "2026-09-04")).toEqual([])
  })
})
