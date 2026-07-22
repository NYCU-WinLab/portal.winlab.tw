import { describe, expect, it } from "bun:test"

import { meetingType, typeFlags, type MeetingType } from "./meeting-type"

describe("meetingType", () => {
  it("maps flags to the three kinds", () => {
    expect(meetingType({ isHoliday: false, isSpeaker: false })).toBe(
      "presentation"
    )
    expect(meetingType({ isHoliday: true, isSpeaker: false })).toBe("holiday")
    expect(meetingType({ isHoliday: false, isSpeaker: true })).toBe("speaker")
  })

  it("prefers holiday if both flags are set (DB CHECK forbids it, be defensive)", () => {
    expect(meetingType({ isHoliday: true, isSpeaker: true })).toBe("holiday")
  })
})

describe("typeFlags", () => {
  it("is the inverse of meetingType for every kind", () => {
    const kinds: MeetingType[] = ["presentation", "speaker", "holiday"]
    for (const t of kinds) {
      expect(meetingType(typeFlags(t))).toBe(t)
    }
  })

  it("never produces the forbidden both-true combination", () => {
    const kinds: MeetingType[] = ["presentation", "speaker", "holiday"]
    for (const t of kinds) {
      const f = typeFlags(t)
      expect(f.isHoliday && f.isSpeaker).toBe(false)
    }
  })
})
