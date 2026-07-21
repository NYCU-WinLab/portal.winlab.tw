import { describe, expect, it } from "bun:test"

import { getCurrentMeetingId } from "./schedule"
import type { Meeting } from "./types"

function meeting(partial: Partial<Meeting> & { id: string }): Meeting {
  return {
    year: 2026,
    weekLabel: null,
    scheduledDate: "2026-01-01",
    isHoliday: false,
    presenter: null,
    presenterUserId: null,
    pptUploaded: false,
    pptLink: null,
    videoUploaded: false,
    videoLink: null,
    paperTitle: null,
    paperLink: null,
    teacherPaperId: null,
    notes: null,
    location: "",
    startTime: "",
    createdAt: "",
    ...partial,
  }
}

describe("getCurrentMeetingId", () => {
  const now = new Date("2026-07-08T12:00:00+08:00")

  it("returns the nearest upcoming meeting, not the first of the year", () => {
    const meetings = [
      meeting({ id: "jan", scheduledDate: "2026-01-08" }),
      meeting({ id: "jul-10", scheduledDate: "2026-07-10" }),
      meeting({ id: "jul-17", scheduledDate: "2026-07-17" }),
    ]
    expect(getCurrentMeetingId(meetings, now)).toBe("jul-10")
  })

  it("counts today as the current meeting", () => {
    const meetings = [
      meeting({ id: "past", scheduledDate: "2026-07-01" }),
      meeting({ id: "today", scheduledDate: "2026-07-08" }),
      meeting({ id: "next", scheduledDate: "2026-07-15" }),
    ]
    expect(getCurrentMeetingId(meetings, now)).toBe("today")
  })

  it("skips holidays when picking the current meeting", () => {
    const meetings = [
      meeting({ id: "holiday", scheduledDate: "2026-07-10", isHoliday: true }),
      meeting({ id: "real", scheduledDate: "2026-07-17" }),
    ]
    expect(getCurrentMeetingId(meetings, now)).toBe("real")
  })

  it("returns null when every meeting is in the past", () => {
    const meetings = [
      meeting({ id: "a", scheduledDate: "2026-01-08" }),
      meeting({ id: "b", scheduledDate: "2026-06-30" }),
    ]
    expect(getCurrentMeetingId(meetings, now)).toBeNull()
  })

  it("returns null for an empty roster", () => {
    expect(getCurrentMeetingId([], now)).toBeNull()
  })
})
