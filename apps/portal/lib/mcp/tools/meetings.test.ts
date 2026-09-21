import { describe, expect, test } from "bun:test"

import { toMeetingRow } from "@/lib/mcp/tools/meetings"
import type { Meeting, MeetingQuestioner } from "@/lib/meetings/types"

const MEETING: Meeting = {
  id: "11111111-1111-4111-8111-111111111111",
  weekLabel: "第 3 週",
  scheduledDate: "2026-09-24",
  isHoliday: false,
  isSpeaker: false,
  isThesis: false,
  presenter: "Loki",
  presenterUserId: "22222222-2222-4222-8222-222222222222",
  pptUploaded: true,
  pptLink: "https://example.test/ppt",
  videoUploaded: false,
  videoLink: null,
  paperTitle: "Attention Is All You Need",
  paperLink: "https://example.test/paper",
  teacherPaperId: null,
  notes: null,
  location: "ED421",
  startTime: "14:00:00",
  createdAt: "2026-08-01T00:00:00Z",
}

const QUESTIONERS: MeetingQuestioner[] = [
  {
    meetingId: MEETING.id,
    userId: "33333333-3333-4333-8333-333333333333",
    name: "Tim",
    source: "auto",
  },
]

describe("toMeetingRow", () => {
  test("shapes a presentation week for an agent", () => {
    const row = toMeetingRow(MEETING, QUESTIONERS)

    expect(row.date).toBe("2026-09-24")
    expect(row.start_time).toBe("14:00")
    expect(row.type).toBe("presentation")
    expect(row.type_label).toBe("報告")
    expect(row.presenter).toBe("Loki")
    expect(row.paper_title).toBe("Attention Is All You Need")
    expect(row.questioners).toEqual([
      {
        user_id: "33333333-3333-4333-8333-333333333333",
        name: "Tim",
        source: "auto",
      },
    ])
    expect(row.url).toBe("https://portal.winlab.tw/meetings?year=2026")
  })

  test("marks a holiday week and carries no questioners", () => {
    const row = toMeetingRow(
      { ...MEETING, isHoliday: true, presenter: null },
      []
    )

    expect(row.type).toBe("holiday")
    expect(row.is_holiday).toBe(true)
    expect(row.presenter).toBeNull()
    expect(row.questioners).toEqual([])
  })

  test("keeps the typed title of a thesis week", () => {
    const row = toMeetingRow(
      { ...MEETING, isThesis: true, paperTitle: "我的碩士論文" },
      []
    )

    expect(row.type).toBe("thesis")
    expect(row.type_label).toBe("碩論")
    expect(row.paper_title).toBe("我的碩士論文")
  })
})
