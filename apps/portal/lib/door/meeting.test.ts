import { describe, expect, test } from "bun:test"

import {
  buildDoorMeeting,
  doorDisplayName,
  taipeiStartsAt,
} from "@/lib/door/meeting"
import type { Meeting } from "@/lib/meetings/types"

const MEETING: Meeting = {
  id: "m1",
  weekLabel: null,
  scheduledDate: "2026-10-05",
  isHoliday: false,
  isSpeaker: false,
  isThesis: false,
  presenter: "舊名字",
  presenterUserId: "p1",
  pptUploaded: false,
  pptLink: "https://example.test/ppt",
  videoUploaded: false,
  videoLink: null,
  paperTitle: "A paper",
  paperLink: "https://example.test/paper",
  teacherPaperId: null,
  notes: null,
  location: "EC 411",
  startTime: "15:30",
  createdAt: "2026-08-01T00:00:00Z",
}

describe("taipeiStartsAt", () => {
  test("adds seconds and the fixed Taipei offset", () => {
    expect(taipeiStartsAt("2026-10-05", "15:30")).toBe(
      "2026-10-05T15:30:00+08:00"
    )
    expect(taipeiStartsAt("2026-10-05", "9:05:30")).toBe(
      "2026-10-05T09:05:30+08:00"
    )
    expect(new Date(taipeiStartsAt("2026-10-05", "00:10")).toISOString()).toBe(
      "2026-10-04T16:10:00.000Z"
    )
  })

  test("refuses a time it cannot read rather than guessing", () => {
    expect(() => taipeiStartsAt("2026-10-05", "afternoon")).toThrow()
    expect(() => taipeiStartsAt("2026-10-05", "25:00")).toThrow()
  })
})

describe("doorDisplayName", () => {
  test("swaps a Han given-family name and collapses whitespace", () => {
    expect(doorDisplayName("哲佑 劉")).toBe("劉哲佑")
    expect(doorDisplayName("  Carol   Wu ")).toBe("Carol Wu")
    expect(doorDisplayName("劉哲佑")).toBe("劉哲佑")
    expect(doorDisplayName("哲佑  劉")).toBe("劉哲佑")
    expect(doorDisplayName("A 哲佑 劉")).toBe("A 哲佑 劉")
  })

  test("falls back to the next candidate when one is empty", () => {
    expect(doorDisplayName(null, "哲佑 劉")).toBe("劉哲佑")
    expect(doorDisplayName("   ", "Tim")).toBe("Tim")
    expect(doorDisplayName(undefined, null)).toBeNull()
  })
})

describe("buildDoorMeeting", () => {
  test("carries names only, profile name first", () => {
    const body = buildDoorMeeting(
      {
        meeting: MEETING,
        questioners: [
          { meetingId: "m1", userId: "q1", name: "羿茗 賴", source: "auto" },
          { meetingId: "m1", userId: "q2", name: null, source: "manual" },
        ],
      },
      [{ user_id: "a1" }, { user_id: "a2" }],
      new Map([
        ["p1", "哲佑 劉"],
        ["a1", "琇雅 曹"],
        ["a2", null],
      ])
    )
    expect(body).toEqual({
      starts_at: "2026-10-05T15:30:00+08:00",
      location: "EC 411",
      type_label: "報告",
      presenter: "劉哲佑",
      questioners: ["賴羿茗"],
      absent: ["曹琇雅"],
    })
  })

  test("uses the row snapshot when the presenter has no profile name", () => {
    const body = buildDoorMeeting(
      {
        meeting: {
          ...MEETING,
          isSpeaker: true,
          presenterUserId: null,
          presenter: "Guest Speaker",
        },
        questioners: [],
      },
      [],
      new Map()
    )
    expect(body.presenter).toBe("Guest Speaker")
    expect(body.type_label).toBe("演講")
  })
})
