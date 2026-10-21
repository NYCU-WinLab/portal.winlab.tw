import { describe, expect, test } from "bun:test"

import { authorizeGroup, visibleGroups } from "@/lib/groups/authorize"

const lab = { id: "aaa", email: "lab-all@winlab.tw", name: "Lab" }
const gcp = { id: "ggg", email: "gcp-billing@winlab.tw", name: "Billing" }
const foreign = { id: "fff", email: "x@other.tw", name: "Other" }

describe("authorizeGroup", () => {
  test("a manager of a manageable group is allowed", () => {
    expect(
      authorizeGroup({ isManager: true, group: lab, domain: "winlab.tw" })
    ).toEqual({ ok: true, group: lab })
  })

  test("a non-manager is denied, whatever the group", () => {
    for (const group of [lab, gcp, null]) {
      expect(
        authorizeGroup({ isManager: false, group, domain: "winlab.tw" })
      ).toEqual({ ok: false, reason: "denied" })
    }
  })

  test("a gcp-* group is not managed, even for a portal admin", () => {
    expect(
      authorizeGroup({ isManager: true, group: gcp, domain: "winlab.tw" })
    ).toEqual({ ok: false, reason: "not_managed" })
  })

  test("a group outside the domain is not managed", () => {
    expect(
      authorizeGroup({ isManager: true, group: foreign, domain: "winlab.tw" })
    ).toEqual({ ok: false, reason: "not_managed" })
  })

  test("a group Google no longer has is not managed, even with a stale manager row", () => {
    expect(
      authorizeGroup({ isManager: true, group: null, domain: "winlab.tw" })
    ).toEqual({ ok: false, reason: "not_managed" })
  })
})

describe("visibleGroups", () => {
  const all = [
    lab,
    gcp,
    foreign,
    { id: "bbb", email: "office@winlab.tw", name: "Office" },
  ]

  test("a portal admin sees every manageable group, never gcp-*", () => {
    expect(
      visibleGroups(all, {
        isAdmin: true,
        managed: new Set(),
        domain: "winlab.tw",
      }).map((g) => g.id)
    ).toEqual(["aaa", "bbb"])
  })

  test("a manager sees only assigned groups that are still manageable", () => {
    expect(
      visibleGroups(all, {
        isAdmin: false,
        managed: new Set(["bbb", "ggg", "gone"]),
        domain: "winlab.tw",
      }).map((g) => g.id)
    ).toEqual(["bbb"])
  })
})
