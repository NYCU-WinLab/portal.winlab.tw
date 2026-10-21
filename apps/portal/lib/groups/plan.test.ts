import { describe, expect, test } from "bun:test"

import {
  applyPending,
  cohortCandidates,
  cohortContribution,
  externalAddresses,
  isPlainMember,
  NO_PENDING,
  planAdditions,
  prunePending,
  withAdded,
  withRemoved,
} from "@/lib/groups/plan"
import type { GroupMember } from "@/lib/groups/types"

const member = (email: string, role = "MEMBER"): GroupMember => ({
  id: `id-${email}`,
  email,
  role,
  type: "USER",
  status: null,
})

describe("planAdditions", () => {
  test("splits candidates into new and already-present, case-insensitively", () => {
    expect(
      planAdditions(
        ["New@x.com", "old@x.com", "new@x.com"],
        ["OLD@x.com", "other@x.com"]
      )
    ).toEqual({ toAdd: ["new@x.com"], already: ["old@x.com"] })
  })
})

describe("externalAddresses", () => {
  test("anything not exactly in the domain is external", () => {
    expect(
      externalAddresses(
        ["a@winlab.tw", "b@gmail.com", "c@sub.winlab.tw", "D@WINLAB.TW"],
        "winlab.tw"
      )
    ).toEqual(["b@gmail.com", "c@sub.winlab.tw"])
  })
})

describe("cohortCandidates", () => {
  const members = [
    { id: "1", email: "A@x.com", name: "A", username: "a" },
    { id: "2", email: null, name: "B", username: "b" },
    { id: "3", email: "c@x.com", name: "C", username: "c" },
    { id: "4", email: "d@x.com", name: "D", username: "d" },
  ]
  const status = new Map<string, string | null>([
    ["a@x.com", "master"],
    ["c@x.com", "alumni"],
  ])

  test("excludes known alumni and members without an email", () => {
    expect(cohortCandidates(members, status, { excludeAlumni: true })).toEqual({
      emails: ["a@x.com", "d@x.com"],
      skippedNoEmail: 1,
      skippedAlumni: 1,
      unknownStatus: 1,
    })
  })

  test("counts kept members whose status is unknown", () => {
    const r = cohortCandidates(members, status, { excludeAlumni: true })
    expect(r.unknownStatus).toBe(1) // d@x.com has no profile
  })

  test("a profile with a null lab_status counts as unknown too", () => {
    const withNull = new Map<string, string | null>([
      ...status,
      ["d@x.com", null],
    ])
    const r = cohortCandidates(members, withNull, { excludeAlumni: true })
    expect(r.emails).toContain("d@x.com")
    expect(r.unknownStatus).toBe(1)
  })

  test("keeps alumni when asked to", () => {
    expect(
      cohortCandidates(members, status, { excludeAlumni: false }).emails
    ).toEqual(["a@x.com", "c@x.com", "d@x.com"])
  })
})

describe("isPlainMember", () => {
  test("only the MEMBER role is plain", () => {
    expect(isPlainMember("MEMBER")).toBe(true)
    expect(isPlainMember("MANAGER")).toBe(false)
    expect(isPlainMember("OWNER")).toBe(false)
    expect(isPlainMember("member")).toBe(false)
    expect(isPlainMember(null)).toBe(false)
    expect(isPlainMember(undefined)).toBe(false)
  })
})

describe("pending changes (Google's list is eventually consistent)", () => {
  test("an address just added shows as pending until Google lists it", () => {
    const pending = withAdded(NO_PENDING, ["New@x.com"])
    expect(applyPending([member("a@x.com")], pending)).toEqual([
      { ...member("a@x.com"), pending: false },
      {
        id: null,
        email: "new@x.com",
        role: "MEMBER",
        type: null,
        status: null,
        pending: true,
      },
    ])
    expect(
      applyPending([member("a@x.com"), member("new@x.com")], pending)
    ).toEqual([
      { ...member("a@x.com"), pending: false },
      { ...member("new@x.com"), pending: false },
    ])
  })

  test("an address just removed is hidden even if Google still lists it", () => {
    const pending = withRemoved(NO_PENDING, "A@x.com")
    expect(
      applyPending([member("a@x.com"), member("b@x.com")], pending)
    ).toEqual([{ ...member("b@x.com"), pending: false }])
  })

  test("adding and removing the same address cancel out", () => {
    const p = withRemoved(withAdded(NO_PENDING, ["a@x.com"]), "a@x.com")
    expect(p).toEqual({ added: [], removed: ["a@x.com"] })
    expect(withAdded(p, ["a@x.com"])).toEqual({
      added: ["a@x.com"],
      removed: [],
    })
  })

  test("prunePending drops what Google has caught up with, and keeps the rest", () => {
    const p = {
      added: ["new@x.com", "slow@x.com"],
      removed: ["gone@x.com", "lag@x.com"],
    }
    expect(prunePending([member("new@x.com"), member("lag@x.com")], p)).toEqual(
      { added: ["slow@x.com"], removed: ["lag@x.com"] }
    )
  })

  test("prunePending returns the same object when nothing settled", () => {
    const p = { added: ["slow@x.com"], removed: [] }
    expect(prunePending([member("a@x.com")], p)).toBe(p)
  })
})

describe("cohortContribution", () => {
  const members = [
    { id: "1", email: "a@x.org" },
    { id: "2", email: "old@x.org" },
  ] as unknown as Parameters<typeof cohortCandidates>[0]
  const status = new Map([["old@x.org", "alumni"]])

  test("contributes nothing when profiles could not be read", () => {
    expect(
      cohortContribution(members, new Map(), {
        excludeAlumni: true,
        profilesLoaded: false,
      }).emails
    ).toEqual([])
  })
  test("excludes alumni when profiles loaded", () => {
    expect(
      cohortContribution(members, status, {
        excludeAlumni: true,
        profilesLoaded: true,
      }).emails
    ).toEqual(["a@x.org"])
  })
  test("no cohort selected contributes nothing", () => {
    expect(
      cohortContribution(undefined, status, {
        excludeAlumni: true,
        profilesLoaded: true,
      }).emails
    ).toEqual([])
  })
})
