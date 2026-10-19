import { describe, expect, it } from "bun:test"

import { PRESENTER_PROFILE, presenterName } from "./presenter-name"
import { toMeeting, type DbMeeting } from "./types"

describe("presenterName", () => {
  it("prefers the profile's current name over the stored copy", () => {
    expect(presenterName("詠翔 詹", { name: "詹詠翔" })).toBe("詹詠翔")
  })

  it("falls back to the copy when there is no profile to ask", () => {
    // An outside speaker (presenter_user_id is null by CHECK), or a member
    // whose profile was deleted under ON DELETE SET NULL.
    expect(presenterName("Prof. Lin", null)).toBe("Prof. Lin")
    expect(presenterName("Prof. Lin", undefined)).toBe("Prof. Lin")
  })

  it("falls back to the copy when the profile has no usable name", () => {
    expect(presenterName("Loki", { name: null })).toBe("Loki")
    expect(presenterName("Loki", { name: "  " })).toBe("Loki")
  })

  it("is null when neither side has a name", () => {
    expect(presenterName(null, null)).toBeNull()
  })
})

describe("PRESENTER_PROFILE", () => {
  it("names the foreign key, so the embed can't pick another relation", () => {
    expect(PRESENTER_PROFILE).toBe(
      "presenter_profile:user_profiles!meetings_presenter_user_id_fkey(name)"
    )
  })
})

describe("toMeeting", () => {
  const row: DbMeeting = {
    id: "m1",
    week_label: null,
    scheduled_date: "2026-10-19",
    is_holiday: false,
    is_speaker: false,
    is_thesis: false,
    presenter: "詠翔 詹",
    presenter_user_id: "u1",
    ppt_uploaded: false,
    ppt_link: null,
    video_uploaded: false,
    video_link: null,
    paper_title: null,
    paper_link: null,
    teacher_paper_id: null,
    notes: null,
    location: "EC 527",
    start_time: "15:30",
    created_at: "2026-09-01T00:00:00Z",
  }

  it("shows the embedded profile name", () => {
    const meeting = toMeeting({ ...row, presenter_profile: { name: "詹詠翔" } })
    expect(meeting.presenter).toBe("詹詠翔")
  })

  it("keeps the stored copy for a row read without the embed", () => {
    expect(toMeeting(row).presenter).toBe("詠翔 詹")
  })
})
