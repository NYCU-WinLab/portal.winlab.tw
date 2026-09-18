import { describe, expect, it } from "bun:test"

import {
  extraCandidates,
  formatMonthDay,
  lastAskedLabel,
  replacementCandidates,
  summarizeRoster,
} from "./questioner-roster"
import type { QuestionPoolMember } from "./types"

function member(
  partial: Partial<QuestionPoolMember> & { userId: string }
): QuestionPoolMember {
  return {
    name: partial.userId.toUpperCase(),
    email: null,
    joinedOn: "2026-06-15",
    lastAskedDate: null,
    timesAsked: 0,
    timesAskedScheduled: 0,
    opportunities: 0,
    rate: 0,
    isPresenter: true,
    isEnabled: true,
    labStatus: "master",
    ...partial,
  }
}

describe("summarizeRoster", () => {
  it("separates the extra members and counts who is switched on", () => {
    const { extras, enabledCount } = summarizeRoster([
      member({ userId: "p1" }),
      member({ userId: "p2", isEnabled: false }),
      member({ userId: "e1", isPresenter: false }),
    ])
    expect(extras.map((m) => m.userId)).toEqual(["e1"])
    expect(enabledCount).toBe(2)
  })
})

describe("extraCandidates", () => {
  it("offers only lab members not already on the roster — presenters included", () => {
    const users = [{ id: "p1" }, { id: "e1" }, { id: "new" }]
    const roster = [
      member({ userId: "p1" }),
      member({ userId: "e1", isPresenter: false }),
    ]
    expect(extraCandidates(users, roster).map((u) => u.id)).toEqual(["new"])
  })
})

describe("replacementCandidates", () => {
  const week = {
    presenterUserId: "p1",
    scheduledDate: "2026-10-05",
    questionerIds: new Set(["q1"]),
  }

  it("mirrors the rules meetings_replace_questioner enforces", () => {
    const pool = [
      member({ userId: "ok" }),
      member({ userId: "p1" }), // presenting that week
      member({ userId: "q1" }), // already asking that week
      member({ userId: "off", isEnabled: false }),
      member({ userId: "alum", labStatus: "alumni" }),
      member({ userId: "teacher", labStatus: "teacher" }),
      member({ userId: "late", joinedOn: "2026-10-06" }),
    ]
    expect(replacementCandidates(pool, week).map((m) => m.userId)).toEqual([
      "ok",
    ])
  })

  it("still offers someone Keycloak has not classified — an admin may pick them by hand", () => {
    const pool = [member({ userId: "unsynced", labStatus: null })]
    expect(replacementCandidates(pool, week)).toHaveLength(1)
  })

  it("accepts a member on the very day they joined", () => {
    const pool = [member({ userId: "sameDay", joinedOn: "2026-10-05" })]
    expect(replacementCandidates(pool, week)).toHaveLength(1)
  })
})

describe("date labels", () => {
  it("reads a calendar date without a timezone shift", () => {
    expect(formatMonthDay("2026-10-05")).toBe("10/5")
    expect(formatMonthDay("2027-01-01")).toBe("1/1")
  })

  it("says so when someone has never asked", () => {
    expect(lastAskedLabel(null)).toBe("從未提問")
    expect(lastAskedLabel("2026-09-14")).toBe("上次提問：9/14")
  })
})
