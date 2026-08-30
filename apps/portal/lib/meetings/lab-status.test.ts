import { describe, expect, test } from "bun:test"

import {
  EXCLUDED_USERNAMES,
  isSelectableMember,
  labStatusFromGroupPath,
  planLabStatusUpdates,
} from "./lab-status"

describe("labStatusFromGroupPath", () => {
  test("reads the leaf of a /lab-member path", () => {
    expect(labStatusFromGroupPath("/lab-member/doctoral")).toBe("doctoral")
    expect(labStatusFromGroupPath("/lab-member/alumni")).toBe("alumni")
  })

  test("ignores groups outside /lab-member", () => {
    expect(labStatusFromGroupPath("/winlab-projects/tasa-satsim")).toBeNull()
    expect(labStatusFromGroupPath("/winlab-admin")).toBeNull()
  })

  test("ignores an unknown leaf rather than inventing a status", () => {
    expect(labStatusFromGroupPath("/lab-member/visiting")).toBeNull()
  })

  test("does not match the parent group itself", () => {
    expect(labStatusFromGroupPath("/lab-member")).toBeNull()
  })
})

describe("isSelectableMember", () => {
  test("accepts an active lab member", () => {
    expect(
      isSelectableMember({ username: "timsu92", labStatus: "master" })
    ).toBe(true)
  })

  test("rejects alumni", () => {
    expect(
      isSelectableMember({ username: "hibbert", labStatus: "alumni" })
    ).toBe(false)
  })

  // Fails closed: a shell account Keycloak has never heard of must not be
  // offered as a candidate just because nobody has classified it.
  test("rejects an unmapped account", () => {
    expect(isSelectableMember({ username: "someone", labStatus: null })).toBe(
      false
    )
    expect(isSelectableMember({ username: null, labStatus: null })).toBe(false)
  })

  // The test accounts sit inside /lab-member/master, so the group rule alone
  // cannot exclude them.
  test("rejects the test accounts even though they carry a real status", () => {
    for (const username of EXCLUDED_USERNAMES) {
      expect(isSelectableMember({ username, labStatus: "master" })).toBe(false)
    }
  })
})

describe("planLabStatusUpdates", () => {
  test("only returns rows whose status actually changed", () => {
    const updates = planLabStatusUpdates(
      [
        { id: "a", username: "timsu92", labStatus: "master" },
        { id: "b", username: "hibbert", labStatus: "master" },
        { id: "c", username: "kcv1750", labStatus: null },
      ],
      new Map([
        ["timsu92", "master"],
        ["hibbert", "alumni"],
        ["kcv1750", "master"],
      ])
    )
    expect(updates).toEqual([
      { id: "b", labStatus: "alumni" },
      { id: "c", labStatus: "master" },
    ])
  })

  // Someone deleted from the realm must be cleared, not left stale — that is
  // the whole reason this is a pull rather than a login-time push.
  test("clears a profile Keycloak no longer knows about", () => {
    const updates = planLabStatusUpdates(
      [{ id: "a", username: "jonathan", labStatus: "master" }],
      new Map()
    )
    expect(updates).toEqual([{ id: "a", labStatus: null }])
  })

  test("leaves an already-null unmapped profile alone", () => {
    const updates = planLabStatusUpdates(
      [{ id: "a", username: null, labStatus: null }],
      new Map()
    )
    expect(updates).toEqual([])
  })
})
