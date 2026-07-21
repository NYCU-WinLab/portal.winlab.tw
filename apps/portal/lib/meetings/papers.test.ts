import { describe, expect, it } from "bun:test"

import {
  addDays,
  paperAvailabilityForMeeting,
  paperCooldownStatus,
  type PaperAssignment,
} from "./papers"

function assign(partial: Partial<PaperAssignment> & { meetingId: string }): PaperAssignment {
  return {
    scheduledDate: "2026-01-01",
    presenter: "someone",
    presenterUserId: "user-x",
    teacherPaperId: "paper-1",
    ...partial,
  }
}

const opts = (o: Partial<Parameters<typeof paperAvailabilityForMeeting>[2]> = {}) => ({
  forDate: "2026-07-10",
  presenterUserId: "me",
  currentMeetingId: "current",
  ...o,
})

describe("addDays", () => {
  it("shifts a date by whole days across a year boundary", () => {
    expect(addDays("2026-07-01", 365)).toBe("2027-07-01") // 2026 is not a leap year
  })
})

describe("paperAvailabilityForMeeting — cooldown", () => {
  it("is available when nothing else holds the paper", () => {
    expect(paperAvailabilityForMeeting("paper-1", [], opts()).available).toBe(true)
  })

  it("blocks a paper presented less than 365 days earlier", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-04-01", presenterUserId: "other" })]
    const r = paperAvailabilityForMeeting("paper-1", a, opts())
    expect(r.available).toBe(false)
    expect(r.reason).toBe("cooldown")
    expect(r.cooldownUntil).toBe("2027-04-01")
  })

  it("frees the paper at exactly 365 days (half-open window)", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-07-01", presenterUserId: "other" })]
    const at365 = paperAvailabilityForMeeting("paper-1", a, opts({ forDate: "2027-07-01" }))
    expect(at365.available).toBe(true)
    const at364 = paperAvailabilityForMeeting("paper-1", a, opts({ forDate: "2027-06-30" }))
    expect(at364.available).toBe(false)
  })

  it("blocks a future booking within the window too (symmetric)", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-09-01", presenterUserId: "other" })]
    expect(paperAvailabilityForMeeting("paper-1", a, opts()).available).toBe(false)
  })

  it("does not block a meeting against its own current pick", () => {
    const a = [assign({ meetingId: "current", scheduledDate: "2026-07-10", presenterUserId: "me" })]
    expect(paperAvailabilityForMeeting("paper-1", a, opts()).available).toBe(true)
  })

  it("reports the latest blocker's release date when several exist", () => {
    const a = [
      assign({ meetingId: "m1", scheduledDate: "2026-05-01", presenterUserId: "a" }),
      assign({ meetingId: "m2", scheduledDate: "2026-06-01", presenterUserId: "b" }),
    ]
    expect(paperAvailabilityForMeeting("paper-1", a, opts()).cooldownUntil).toBe("2027-06-01")
  })
})

describe("paperAvailabilityForMeeting — self-repeat", () => {
  it("blocks the same student forever, even outside the cooldown window", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2020-01-01", presenterUserId: "me" })]
    const r = paperAvailabilityForMeeting("paper-1", a, opts())
    expect(r.available).toBe(false)
    expect(r.reason).toBe("self-repeat")
  })

  it("lets a different student pick it once the cooldown has passed", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2020-01-01", presenterUserId: "someone-else" })]
    expect(paperAvailabilityForMeeting("paper-1", a, opts()).available).toBe(true)
  })

  it("prefers the self-repeat reason over cooldown", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-06-01", presenterUserId: "me" })]
    expect(paperAvailabilityForMeeting("paper-1", a, opts()).reason).toBe("self-repeat")
  })
})

describe("paperCooldownStatus", () => {
  const today = "2026-07-17"

  it("is free when the last presentation was over a year ago", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2025-01-01" })]
    expect(paperCooldownStatus("paper-1", a, today).inCooldown).toBe(false)
  })

  it("is on cooldown when presented recently, and reports the release date", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-07-01", presenter: "昱宏" })]
    const s = paperCooldownStatus("paper-1", a, today)
    expect(s.inCooldown).toBe(true)
    expect(s.cooldownUntil).toBe("2027-07-01")
    expect(s.blockedBy?.presenter).toBe("昱宏")
  })

  it("ignores assignments for other papers", () => {
    const a = [assign({ meetingId: "m1", scheduledDate: "2026-07-01", teacherPaperId: "paper-2" })]
    expect(paperCooldownStatus("paper-1", a, today).inCooldown).toBe(false)
  })
})
