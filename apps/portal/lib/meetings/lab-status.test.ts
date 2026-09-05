import { describe, expect, test } from "bun:test"

import {
  checkLabStatusUpdatePlan,
  EXCLUDED_USERNAMES,
  findCohortOnlyUsernames,
  findUnrecognisedGroupPaths,
  isCohortGroupPath,
  isRotationMember,
  isSelectableMember,
  rotationExclusionReason,
  labStatusFromGroupPath,
  parseLabStatus,
  planLabStatusUpdates,
  type LabStatus,
  type LabStatusRow,
  type LabStatusUpdate,
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

  test("a cohort group is not an identity", () => {
    expect(labStatusFromGroupPath("/lab-member/113")).toBeNull()
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

  // The lab's rule (2026-08-31): the rotation is 碩士生 and 博士生 only.
  // Teachers, assistants and undergrads attend but are never scheduled, so
  // offering them in the picker would just create work an admin has to undo.
  test("rejects lab members who are not grad students", () => {
    expect(isSelectableMember({ username: "prof", labStatus: "teacher" })).toBe(
      false
    )
    expect(isSelectableMember({ username: "ra", labStatus: "assistant" })).toBe(
      false
    )
    expect(
      isSelectableMember({ username: "junior", labStatus: "undergrad" })
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

  // Isolates the username guard from the labStatus guard: the only other
  // null-username case in this file also has a null labStatus, so a
  // regression dropping just the `if (!u.username) return false` line would
  // still pass every other test here.
  test("rejects a real status with no username", () => {
    expect(isSelectableMember({ username: null, labStatus: "master" })).toBe(
      false
    )
  })
})

describe("parseLabStatus", () => {
  test("accepts a known status", () => {
    expect(parseLabStatus("doctoral")).toBe("doctoral")
    expect(parseLabStatus("alumni")).toBe("alumni")
  })

  test("rejects anything else, including null", () => {
    expect(parseLabStatus("visiting")).toBeNull()
    expect(parseLabStatus("")).toBeNull()
    expect(parseLabStatus(null)).toBeNull()
  })
})

describe("findUnrecognisedGroupPaths", () => {
  test("returns nothing when every child maps to a known status", () => {
    expect(
      findUnrecognisedGroupPaths([
        "/lab-member/doctoral",
        "/lab-member/master",
        "/lab-member/undergrad",
      ])
    ).toEqual([])
  })

  test("names a renamed or newly added group", () => {
    expect(
      findUnrecognisedGroupPaths(["/lab-member/master", "/lab-member/masters"])
    ).toEqual(["/lab-member/masters"])
  })

  test("an empty child list is not itself unrecognised", () => {
    expect(findUnrecognisedGroupPaths([])).toEqual([])
  })

  // The realm grew four admission-year groups on 2026-09-03 (112–115). They
  // describe a cohort, not a status, so they must not stop the sync.
  test("lets admission-year cohort groups through", () => {
    expect(
      findUnrecognisedGroupPaths([
        "/lab-member/112",
        "/lab-member/113",
        "/lab-member/114",
        "/lab-member/115",
        "/lab-member/teacher",
        "/lab-member/assistant",
        "/lab-member/doctoral",
        "/lab-member/master",
        "/lab-member/undergrad",
        "/lab-member/alumni",
      ])
    ).toEqual([])
  })

  test("still names an unknown group sitting next to cohort groups", () => {
    expect(
      findUnrecognisedGroupPaths([
        "/lab-member/113",
        "/lab-member/master",
        "/lab-member/visiting",
      ])
    ).toEqual(["/lab-member/visiting"])
  })
})

describe("isCohortGroupPath", () => {
  test("accepts a zero-padded 民國 year under /lab-member", () => {
    expect(isCohortGroupPath("/lab-member/112")).toBe(true)
    expect(isCohortGroupPath("/lab-member/115")).toBe(true)
    expect(isCohortGroupPath("/lab-member/095")).toBe(true)
  })

  test("pins both ends of the realm's admissionYear range", () => {
    expect(isCohortGroupPath("/lab-member/089")).toBe(false)
    expect(isCohortGroupPath("/lab-member/090")).toBe(true)
    expect(isCohortGroupPath("/lab-member/199")).toBe(true)
    expect(isCohortGroupPath("/lab-member/200")).toBe(false)
  })

  // parseAdmissionYear alone accepts "95" and trims whitespace; the digit
  // regex is what makes a group NAME stricter than the attribute. These would
  // all pass if that regex were dropped.
  test("requires exactly three digits, no padding shortcuts, no whitespace", () => {
    expect(isCohortGroupPath("/lab-member/95")).toBe(false) // in range, unpadded
    expect(isCohortGroupPath("/lab-member/12")).toBe(false) // out of range too
    expect(isCohortGroupPath("/lab-member/2026")).toBe(false) // 西元
    expect(isCohortGroupPath("/lab-member/113 ")).toBe(false)
    expect(isCohortGroupPath("/lab-member/ 113")).toBe(false)
    expect(isCohortGroupPath("/lab-member/113a")).toBe(false)
    expect(isCohortGroupPath("/lab-member/113/foo")).toBe(false)
    expect(isCohortGroupPath("/lab-member/master")).toBe(false)
  })

  test("only applies under /lab-member", () => {
    expect(isCohortGroupPath("/winlab-projects/113")).toBe(false)
    expect(isCohortGroupPath("/113")).toBe(false)
    expect(isCohortGroupPath("/lab-member")).toBe(false)
  })
})

describe("findCohortOnlyUsernames", () => {
  const identity = new Map<string, LabStatus>([
    ["alice", "master"],
    ["bob", "doctoral"],
  ])

  test("is empty when every cohort member holds an identity", () => {
    expect(findCohortOnlyUsernames(["alice", "bob"], identity)).toEqual([])
  })

  test("names the members no identity group mentioned, sorted", () => {
    expect(
      findCohortOnlyUsernames(["zed", "alice", "carol", "bob"], identity)
    ).toEqual(["carol", "zed"])
  })

  test("reports a person in two cohorts once", () => {
    expect(findCohortOnlyUsernames(["carol", "carol"], identity)).toEqual([
      "carol",
    ])
  })

  test("an empty cohort is not a problem", () => {
    expect(findCohortOnlyUsernames([], identity)).toEqual([])
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

describe("checkLabStatusUpdatePlan", () => {
  // Fixtures are scaled to a real measurement of the lab's current
  // Keycloak-mapped projection: 44 profiles carry a non-null lab_status
  // today (master 32, doctoral 4, assistant 3, undergrad 2, alumni 2,
  // teacher 1). `nonNullProfiles` stands in for "44 rows currently have a
  // status"; `clearUpdates` stands in for "N of them would go to null".
  function nonNullProfiles(n: number): LabStatusRow[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      username: `u${i}`,
      labStatus: "master",
    }))
  }
  function clearUpdates(n: number): LabStatusUpdate[] {
    return Array.from({ length: n }, (_, i) => ({
      id: `p${i}`,
      labStatus: null,
    }))
  }

  test("refuses a sweep the size of a failed /lab-member/master read", () => {
    // 32 of 44 = 73%, well past both floors.
    const result = checkLabStatusUpdatePlan(
      nonNullProfiles(44),
      clearUpdates(32)
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.detail).toContain("32")
      expect(result.detail).toContain("44")
    }
  })

  // The case that proves BOTH conditions are required, not just one: 4 of 44
  // is over the 3-row floor but under the 20% ratio floor (9%). A
  // row-count-only guard would refuse this and halt the entire sync over
  // four people (the size of /lab-member/doctoral); a ratio-only guard would
  // let through a mass-clear in a small dataset. Don't "simplify" this to
  // one condition.
  test("allows a sweep the size of /lab-member/doctoral (4 of 44, under the ratio floor)", () => {
    const result = checkLabStatusUpdatePlan(
      nonNullProfiles(44),
      clearUpdates(4)
    )
    expect(result.ok).toBe(true)
  })

  test("allows a sweep at exactly the row floor (3 of 44)", () => {
    const result = checkLabStatusUpdatePlan(
      nonNullProfiles(44),
      clearUpdates(3)
    )
    expect(result.ok).toBe(true)
  })

  test("allows a small, plausible sweep (2 of 44)", () => {
    const result = checkLabStatusUpdatePlan(
      nonNullProfiles(44),
      clearUpdates(2)
    )
    expect(result.ok).toBe(true)
  })

  test("allows a plan that clears nobody", () => {
    const result = checkLabStatusUpdatePlan(nonNullProfiles(44), [])
    expect(result.ok).toBe(true)
  })

  test("allows a plan that only assigns statuses, never clears one", () => {
    const profiles: LabStatusRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `q${i}`,
      username: `u${i}`,
      labStatus: null,
    }))
    const updates: LabStatusUpdate[] = profiles.map((p) => ({
      id: p.id,
      labStatus: "master",
    }))
    const result = checkLabStatusUpdatePlan(profiles, updates)
    expect(result.ok).toBe(true)
  })
})

describe("isRotationMember", () => {
  test("only 碩士生 and 博士生 are in the rotation", () => {
    expect(isRotationMember("doctoral")).toBe(true)
    expect(isRotationMember("master")).toBe(true)
    for (const other of ["teacher", "assistant", "undergrad", "alumni", null]) {
      expect(isRotationMember(other)).toBe(false)
    }
  })

  // The SQL mirror tests the raw column, so this one does too — a value the
  // CHECK constraint does not allow today must still not read as eligible.
  test("an unrecognised status is not in the rotation", () => {
    expect(isRotationMember("visiting")).toBe(false)
  })
})

describe("rotationExclusionReason", () => {
  test("a rotation member has no reason", () => {
    expect(rotationExclusionReason("master")).toBeNull()
  })

  // The three reasons are not cosmetic: unsynced keeps the weeks it already
  // holds and can still be assigned by hand, the other two are evicted and
  // refused. See 20260831140200's header.
  test("distinguishes no-information from a positive placement elsewhere", () => {
    expect(rotationExclusionReason(null)).toBe("unsynced")
    expect(rotationExclusionReason("alumni")).toBe("alumni")
    expect(rotationExclusionReason("teacher")).toBe("not-graduate")
    expect(rotationExclusionReason("undergrad")).toBe("not-graduate")
  })
})
