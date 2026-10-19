import { describe, expect, test } from "bun:test"

import {
  filterGroups,
  isManageableGroup,
  isValidGroupId,
} from "@/lib/groups/scope"

describe("isManageableGroup", () => {
  test("any group in the domain is manageable", () => {
    expect(isManageableGroup("lab-all@winlab.tw", "winlab.tw")).toBe(true)
    expect(isManageableGroup("Office@WinLab.TW", "winlab.tw")).toBe(true)
    expect(isManageableGroup("office@winlab.tw", "WINLAB.TW")).toBe(true)
  })

  test("gcp-* groups are never manageable, whatever the case", () => {
    expect(isManageableGroup("gcp-billing@winlab.tw", "winlab.tw")).toBe(false)
    expect(isManageableGroup("GCP-Org-Admins@winlab.tw", "winlab.tw")).toBe(
      false
    )
    expect(isManageableGroup(" gcp-x@winlab.tw ", "winlab.tw")).toBe(false)
  })

  test("only the gcp- prefix is excluded", () => {
    expect(isManageableGroup("gcpx@winlab.tw", "winlab.tw")).toBe(true)
    expect(isManageableGroup("team-gcp-@winlab.tw", "winlab.tw")).toBe(true)
  })

  test("groups outside the domain are not manageable", () => {
    for (const email of [
      "x@other.tw",
      "x@sub.winlab.tw",
      "x@winlab.tw.evil.com",
      "x@evilwinlab.tw",
      "@winlab.tw",
      "winlab.tw",
      "",
    ]) {
      expect(isManageableGroup(email, "winlab.tw")).toBe(false)
    }
  })
})

describe("isValidGroupId", () => {
  test("accepts Directory ids only", () => {
    expect(isValidGroupId("03znysh71oj6qxe")).toBe(true)
    for (const bad of ["", "groups/abc", "a-b", "a@winlab.tw", "x".repeat(65)])
      expect(isValidGroupId(bad)).toBe(false)
  })
})

describe("filterGroups", () => {
  const groups = [
    { id: "1", email: "lab-all@winlab.tw", name: "全實驗室" },
    { id: "2", email: "announce@winlab.tw", name: "Announce" },
  ]

  test("matches name or address, case-insensitively", () => {
    expect(filterGroups(groups, "ANNO").map((g) => g.id)).toEqual(["2"])
    expect(filterGroups(groups, "實驗室").map((g) => g.id)).toEqual(["1"])
  })

  test("a blank query keeps everything", () => {
    expect(filterGroups(groups, "  ")).toEqual(groups)
  })
})
