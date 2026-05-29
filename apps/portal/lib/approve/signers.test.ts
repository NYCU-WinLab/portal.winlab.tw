import { describe, expect, test } from "bun:test"

import { computeOrphanedSigners } from "@/lib/approve/signers"

describe("computeOrphanedSigners", () => {
  test("returns registered signers no longer backed by any field", () => {
    const fieldSignerIds = ["a", "b"]
    const registered = ["a", "b", "c", "d"]
    expect(computeOrphanedSigners(fieldSignerIds, registered)).toEqual([
      "c",
      "d",
    ])
  })

  test("returns empty when every registered signer is still used", () => {
    expect(computeOrphanedSigners(["a", "b"], ["a", "b"])).toEqual([])
  })

  test("returns all registered when no field uses any signer", () => {
    expect(computeOrphanedSigners([], ["a", "b"])).toEqual(["a", "b"])
  })

  test("returns empty for an empty registered list", () => {
    expect(computeOrphanedSigners(["a"], [])).toEqual([])
  })

  test("preserves the order of the registered list", () => {
    expect(computeOrphanedSigners(["b"], ["c", "a", "b", "d"])).toEqual([
      "c",
      "a",
      "d",
    ])
  })

  test("keeps duplicate orphans (no dedupe on the registered side)", () => {
    expect(computeOrphanedSigners([], ["a", "a", "b"])).toEqual(["a", "a", "b"])
  })

  test("ignores extra used ids that are not registered", () => {
    expect(computeOrphanedSigners(["a", "x", "y"], ["a", "b"])).toEqual(["b"])
  })
})
