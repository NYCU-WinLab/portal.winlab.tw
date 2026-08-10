import { describe, expect, test } from "bun:test"

import {
  adjacentListId,
  nextSequenceIndex,
  resolveLightboxNextStep,
  resolveLightboxPrevStep,
} from "@/lib/gallery/lightbox-nav"

describe("resolveLightboxPrevStep", () => {
  test("moves within sequence before wall", () => {
    expect(resolveLightboxPrevStep(2, 4, true)).toBe("sequence")
  })

  test("moves to wall at sequence start", () => {
    expect(resolveLightboxPrevStep(0, 4, true)).toBe("wall")
  })

  test("wraps sequence when no wall prev", () => {
    expect(resolveLightboxPrevStep(0, 4, false)).toBe("sequence-wrap")
  })
})

describe("resolveLightboxNextStep", () => {
  test("moves to wall at sequence end", () => {
    expect(resolveLightboxNextStep(3, 4, true)).toBe("wall")
  })
})

describe("nextSequenceIndex", () => {
  test("wraps at edges", () => {
    expect(nextSequenceIndex(0, 3, "prev")).toBe(2)
    expect(nextSequenceIndex(2, 3, "next")).toBe(0)
  })
})

describe("adjacentListId", () => {
  test("returns null for empty or single-item lists", () => {
    expect(adjacentListId([], "a", "next")).toBeNull()
    expect(adjacentListId(["a"], "a", "next")).toBeNull()
  })

  test("wraps prev/next across the list", () => {
    const ids = ["a", "b", "c"]
    expect(adjacentListId(ids, "a", "prev")).toBe("c")
    expect(adjacentListId(ids, "a", "next")).toBe("b")
    expect(adjacentListId(ids, "c", "next")).toBe("a")
  })

  test("returns null when current id is missing", () => {
    expect(adjacentListId(["a", "b"], "z", "next")).toBeNull()
  })
})
