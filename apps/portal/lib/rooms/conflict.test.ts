import { describe, expect, test } from "bun:test"

import { describeConflict, findConflict, taipeiHHmm } from "./conflict"
import type { BusySlot } from "./types"

/** `date` + Taipei "HH:mm" as the ISO instant the API deals in. */
function iso(time: string): string {
  return new Date(`2026-08-04T${time}:00+08:00`).toISOString()
}

function busy(room: string, start: string, end: string, who = "someone") {
  return { room, start: iso(start), end: iso(end), subscriber: who } as BusySlot
}

// 10:30–12:30, the two-hour booking that started this.
const START = iso("10:30")
const END = iso("12:30")

describe("findConflict", () => {
  test("no reservations means no conflict", () => {
    expect(findConflict([], "600A", START, END)).toBeNull()
  })

  test("ignores other rooms", () => {
    expect(
      findConflict([busy("600B", "10:00", "13:00")], "600A", START, END)
    ).toBeNull()
  })

  // The case that makes a long booking fail while a short one succeeds: the
  // first half-hour is clear, so the grid looks bookable, and only the tail
  // of the span collides.
  test("catches a clash in the last half hour of a long booking", () => {
    const clash = findConflict(
      [busy("600A", "12:00", "13:00", "cklin")],
      "600A",
      START,
      END
    )
    expect(clash).not.toBeNull()
    expect(clash!.start).toBe("12:00")
    expect(clash!.subscriber).toBe("cklin")
  })

  test("catches a clash in the middle", () => {
    const clash = findConflict(
      [busy("600A", "11:00", "11:30")],
      "600A",
      START,
      END
    )
    expect(clash!.start).toBe("11:00")
    expect(clash!.end).toBe("11:30")
  })

  test("a reservation that merely touches the boundary is not a clash", () => {
    // Ends exactly when ours starts, and starts exactly when ours ends.
    expect(
      findConflict(
        [busy("600A", "09:00", "10:30"), busy("600A", "12:30", "14:00")],
        "600A",
        START,
        END
      )
    ).toBeNull()
  })

  test("an all-day reservation clashes", () => {
    const clash = findConflict(
      [busy("600A", "08:00", "22:00", "ken930603")],
      "600A",
      START,
      END
    )
    expect(clash!.subscriber).toBe("ken930603")
  })

  // The lab's own account holding the room is still a conflict — the dept
  // system won't double-book it just because it's us.
  test("the lab's own booking is a conflict too", () => {
    expect(
      findConflict(
        [busy("600A", "11:00", "12:00", "cctseng")],
        "600A",
        START,
        END
      )
    ).not.toBeNull()
  })

  test("reports the earliest clash when there are several", () => {
    const clash = findConflict(
      [busy("600A", "12:00", "13:00"), busy("600A", "11:00", "11:30")],
      "600A",
      START,
      END
    )
    expect(clash!.start).toBe("11:00")
  })
})

describe("taipeiHHmm", () => {
  test("reads the instant in Taipei, not UTC", () => {
    expect(taipeiHHmm(iso("10:30"))).toBe("10:30")
    // 00:30 Taipei is the previous afternoon in UTC.
    expect(taipeiHHmm(iso("00:30"))).toBe("00:30")
  })
})

describe("describeConflict", () => {
  test("names the room, the clashing window and who holds it", () => {
    const text = describeConflict(
      "600A",
      { startTime: "10:30", endTime: "12:30" },
      { start: "12:00", end: "13:00", subscriber: "cklin" }
    )
    expect(text).toContain("600A")
    expect(text).toContain("12:00–13:00")
    expect(text).toContain("cklin")
    expect(text).toContain("10:30–12:30")
  })
})
