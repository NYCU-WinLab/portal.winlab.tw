import { describe, expect, test } from "bun:test"

import { needsChildrenFetch } from "./group-tree"

describe("needsChildrenFetch", () => {
  test("an omitted subGroups field means we must ask /children", () => {
    expect(needsChildrenFetch({})).toBe(true)
  })

  test("an EMPTY subGroups array also means we must ask /children", () => {
    // The regression this file exists for: Keycloak 23+ sends `subGroups: []`
    // plus a subGroupCount, so `subGroups ?? fetch()` never fires and a realm
    // with real subgroups reports having none.
    expect(needsChildrenFetch({ subGroups: [] })).toBe(true)
  })

  test("a populated subGroups array is authoritative — no extra request", () => {
    expect(needsChildrenFetch({ subGroups: [{ id: "a" }] })).toBe(false)
  })
})
