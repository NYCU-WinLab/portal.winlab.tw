import { describe, expect, test } from "bun:test"

import {
  DEFAULT_VERIFY_PLAN,
  allObjectNamesPresent,
  objectNamesFromPaths,
  storageSearchOptions,
} from "@/lib/gallery/storage-verify"

describe("DEFAULT_VERIFY_PLAN", () => {
  test("first attempt has no delay; later attempts back off and cap", () => {
    expect(DEFAULT_VERIFY_PLAN.attempts).toBe(10)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(0)).toBe(0)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(1)).toBe(150)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(2)).toBe(300)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(10)).toBe(900)
  })
})

describe("objectNamesFromPaths", () => {
  test("strips the userId prefix when present", () => {
    expect(
      objectNamesFromPaths(
        ["u1/folder/a.jpg", "orphan/b.jpg", "u1/c.jpg"],
        "u1"
      )
    ).toEqual(["folder/a.jpg", "orphan/b.jpg", "c.jpg"])
  })
})

describe("allObjectNamesPresent", () => {
  test("requires a non-empty expected list and every name present", () => {
    expect(allObjectNamesPresent([], ["a"])).toBe(false)
    expect(allObjectNamesPresent(["a", "b"], ["b", "a"])).toBe(true)
    expect(allObjectNamesPresent(["a", "b"], ["a"])).toBe(false)
  })
})

describe("storageSearchOptions", () => {
  test("scopes list search to the object name", () => {
    expect(storageSearchOptions("folder/shot.jpg")).toEqual({
      limit: 20,
      search: "folder/shot.jpg",
    })
  })
})
