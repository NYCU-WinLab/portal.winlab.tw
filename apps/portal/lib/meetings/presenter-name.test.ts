import { describe, expect, it } from "bun:test"

import {
  presenterName,
  presenterOrder,
  type PresenterRow,
} from "./presenter-name"
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

describe("presenterOrder", () => {
  const row = (
    presenter: string | null,
    userId: string | null,
    profileName?: string | null
  ): PresenterRow => ({
    presenter,
    presenter_user_id: userId,
    presenter_profile: profileName === undefined ? null : { name: profileName },
  })

  it("lists each member once, by their current name", () => {
    expect(
      presenterOrder([
        row("詠翔 詹", "u1", "詹詠翔"),
        row("Ann", "u2", "安安"),
        row("詹詠翔", "u1", "詹詠翔"),
      ])
    ).toEqual(["詹詠翔", "安安"])
  })

  it("keeps a member whose stored copy is null", () => {
    expect(presenterOrder([row(null, "u1", "詹詠翔")])).toEqual(["詹詠翔"])
  })

  it("keeps two members who share a name apart", () => {
    expect(
      presenterOrder([
        row("王小明", "u1", "王小明"),
        row("王小明", "u2", "王小明"),
      ])
    ).toEqual(["王小明", "王小明"])
  })

  it("lists an outside speaker once by name", () => {
    expect(
      presenterOrder([row("Prof. Lin", null), row("Prof. Lin", null)])
    ).toEqual(["Prof. Lin"])
  })

  it("never merges a speaker week with a member of the same name", () => {
    // A speaker week has no id (CHECK) and its name is free text, so a
    // matching name is no evidence it is that member. Merging would drop a
    // real presenter; keeping both only repeats a name.
    const member = row("Alex", "u1", "Alex")
    const speaker = row("Alex", null)
    expect(
      presenterOrder([speaker, row("Blair", "u2", "Blair"), member])
    ).toEqual(["Alex", "Blair", "Alex"])
    expect(presenterOrder([member, speaker])).toEqual(["Alex", "Alex"])
  })

  it("keeps a speaker apart from a member whose id reads the same", () => {
    // Ids and names share one set of keys, so each carries its kind.
    const member = row("Alex", "u1", "Alex")
    const speaker = row("u1", null)
    expect(presenterOrder([member, speaker])).toEqual(["Alex", "u1"])
    expect(presenterOrder([speaker, member])).toEqual(["u1", "Alex"])
  })

  it("skips a row with no name on either side", () => {
    expect(presenterOrder([row(null, "u1", "  "), row(null, null)])).toEqual([])
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
