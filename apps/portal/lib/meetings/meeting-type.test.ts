import { describe, expect, it } from "bun:test"

import {
  hasFreeFormTitle,
  meetingType,
  typeFlags,
  type MeetingType,
} from "./meeting-type"

const ALL_KINDS: MeetingType[] = [
  "presentation",
  "speaker",
  "thesis",
  "holiday",
]

describe("meetingType", () => {
  it("maps flags to the four kinds", () => {
    expect(
      meetingType({ isHoliday: false, isSpeaker: false, isThesis: false })
    ).toBe("presentation")
    expect(
      meetingType({ isHoliday: true, isSpeaker: false, isThesis: false })
    ).toBe("holiday")
    expect(
      meetingType({ isHoliday: false, isSpeaker: true, isThesis: false })
    ).toBe("speaker")
    expect(
      meetingType({ isHoliday: false, isSpeaker: false, isThesis: true })
    ).toBe("thesis")
  })

  it("prefers holiday if several flags are set (DB CHECK forbids it, be defensive)", () => {
    expect(
      meetingType({ isHoliday: true, isSpeaker: true, isThesis: true })
    ).toBe("holiday")
    expect(
      meetingType({ isHoliday: false, isSpeaker: true, isThesis: true })
    ).toBe("speaker")
  })
})

describe("typeFlags", () => {
  it("is the inverse of meetingType for every kind", () => {
    for (const t of ALL_KINDS) {
      expect(meetingType(typeFlags(t))).toBe(t)
    }
  })

  it("never sets more than one flag", () => {
    for (const t of ALL_KINDS) {
      const f = typeFlags(t)
      const set = [f.isHoliday, f.isSpeaker, f.isThesis].filter(Boolean)
      expect(set.length).toBeLessThanOrEqual(1)
    }
  })

  it("never sets is_thesis alongside is_holiday or is_speaker (DB CHECK)", () => {
    for (const t of ALL_KINDS) {
      const f = typeFlags(t)
      expect(f.isThesis && (f.isHoliday || f.isSpeaker)).toBe(false)
    }
  })
})

describe("hasFreeFormTitle", () => {
  it("is true exactly for the kinds the DB lets a caller type a title on", () => {
    expect(hasFreeFormTitle("speaker")).toBe(true)
    expect(hasFreeFormTitle("thesis")).toBe(true)
    expect(hasFreeFormTitle("presentation")).toBe(false)
    expect(hasFreeFormTitle("holiday")).toBe(false)
  })
})
