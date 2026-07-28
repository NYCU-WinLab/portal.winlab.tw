import { describe, expect, test } from "bun:test"

import { mapGroupsToPortalUsers, usableGroups } from "./attendee-groups"
import type { AttendeeGroup } from "./keycloak-groups"

const PORTAL_USERS = [
  { id: "uuid-a", email: "alice@winlab.tw" },
  { id: "uuid-b", email: "bob@winlab.tw" },
  { id: "uuid-c", email: null },
]

function group(
  name: string,
  members: { email: string | null; name?: string }[]
): AttendeeGroup {
  return {
    id: `g-${name}`,
    name,
    path: `/winlab-projects/${name}`,
    members: members.map((m, i) => ({
      id: `kc-${name}-${i}`,
      email: m.email,
      name: m.name ?? null,
    })),
  }
}

describe("mapGroupsToPortalUsers", () => {
  test("matches members to portal users by email", () => {
    const [mapped] = mapGroupsToPortalUsers(
      [group("ai", [{ email: "alice@winlab.tw" }, { email: "bob@winlab.tw" }])],
      PORTAL_USERS
    )
    expect(mapped!.userIds).toEqual(["uuid-a", "uuid-b"])
    expect(mapped!.unmatched).toEqual([])
  })

  test("matching is case-insensitive — neither system normalises email", () => {
    const [mapped] = mapGroupsToPortalUsers(
      [group("ai", [{ email: "Alice@WinLab.tw" }])],
      PORTAL_USERS
    )
    expect(mapped!.userIds).toEqual(["uuid-a"])
  })

  test("members without a portal account are reported, not silently dropped", () => {
    const [mapped] = mapGroupsToPortalUsers(
      [
        group("ai", [
          { email: "alice@winlab.tw" },
          { email: "ghost@winlab.tw", name: "Ghost" },
        ]),
      ],
      PORTAL_USERS
    )
    expect(mapped!.userIds).toEqual(["uuid-a"])
    expect(mapped!.unmatched).toEqual(["Ghost"])
  })

  test("a member with no email at all counts as unmatched", () => {
    const [mapped] = mapGroupsToPortalUsers(
      [group("ai", [{ email: null, name: "No Mail" }])],
      PORTAL_USERS
    )
    expect(mapped!.userIds).toEqual([])
    expect(mapped!.unmatched).toEqual(["No Mail"])
  })

  test("the same portal user listed twice is only added once", () => {
    const [mapped] = mapGroupsToPortalUsers(
      [
        group("ai", [
          { email: "alice@winlab.tw" },
          { email: "ALICE@winlab.tw" },
        ]),
      ],
      PORTAL_USERS
    )
    expect(mapped!.userIds).toEqual(["uuid-a"])
  })
})

describe("usableGroups", () => {
  test("drops groups where nothing matched and sorts by path", () => {
    const mapped = mapGroupsToPortalUsers(
      [
        group("zeta", [{ email: "bob@winlab.tw" }]),
        group("empty", [{ email: "ghost@winlab.tw" }]),
        group("alpha", [{ email: "alice@winlab.tw" }]),
      ],
      PORTAL_USERS
    )
    expect(usableGroups(mapped).map((g) => g.name)).toEqual(["alpha", "zeta"])
  })
})
