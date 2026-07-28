import { describe, expect, test } from "bun:test"

import { mergeAttendees, toPickableGroups } from "./attendee-groups"
import type { AttendeeGroup } from "./keycloak-groups"

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

describe("toPickableGroups", () => {
  test("a member is invitable on Keycloak's data alone — no Portal account needed", () => {
    const [g] = toPickableGroups([
      group("ai", [{ email: "nobody@winlab.tw", name: "Never Logged In" }]),
    ])
    expect(g!.members).toEqual([
      { name: "Never Logged In", email: "nobody@winlab.tw" },
    ])
  })

  test("members with no email are reported, not silently dropped", () => {
    const [g] = toPickableGroups([
      group("ai", [
        { email: "a@winlab.tw", name: "A" },
        { email: null, name: "No Mail" },
      ]),
    ])
    expect(g!.members).toHaveLength(1)
    expect(g!.unmailable).toEqual(["No Mail"])
  })

  test("the same address listed twice only appears once", () => {
    const [g] = toPickableGroups([
      group("ai", [
        { email: "a@winlab.tw", name: "A" },
        { email: "A@WinLab.tw", name: "A again" },
      ]),
    ])
    expect(g!.members).toHaveLength(1)
  })

  test("falls back to the address when Keycloak has no display name", () => {
    const [g] = toPickableGroups([group("ai", [{ email: "a@winlab.tw" }])])
    expect(g!.members[0]!.name).toBe("a@winlab.tw")
  })

  test("groups with nobody invitable are dropped, and the rest sort by path", () => {
    const groups = toPickableGroups([
      group("zeta", [{ email: "z@winlab.tw" }]),
      group("empty", [{ email: null, name: "No Mail" }]),
      group("alpha", [{ email: "a@winlab.tw" }]),
    ])
    expect(groups.map((g) => g.name)).toEqual(["alpha", "zeta"])
  })
})

describe("mergeAttendees", () => {
  test("adds new people and keeps the existing order", () => {
    expect(
      mergeAttendees(
        [{ name: "A", email: "a@winlab.tw" }],
        [{ name: "B", email: "b@winlab.tw" }]
      )
    ).toEqual([
      { name: "A", email: "a@winlab.tw" },
      { name: "B", email: "b@winlab.tw" },
    ])
  })

  test("adding a group twice doesn't duplicate anyone", () => {
    const once = mergeAttendees([], [{ name: "A", email: "a@winlab.tw" }])
    expect(mergeAttendees(once, [{ name: "A", email: "A@WINLAB.TW" }])).toEqual(
      once
    )
  })
})
