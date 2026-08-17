import { describe, expect, test } from "bun:test"

import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  normalizeReactionCounts,
  normalizeReactionNames,
} from "@/lib/gallery/reactions"

describe("normalizeReactionCounts", () => {
  test("returns all-zero counts for null / undefined / non-object", () => {
    expect(normalizeReactionCounts(null)).toEqual(EMPTY_REACTION_COUNTS)
    expect(normalizeReactionCounts(undefined)).toEqual(EMPTY_REACTION_COUNTS)
    expect(normalizeReactionCounts("nope")).toEqual(EMPTY_REACTION_COUNTS)
    expect(normalizeReactionCounts(42)).toEqual(EMPTY_REACTION_COUNTS)
  })

  test("fills known reactions and leaves the rest at zero", () => {
    expect(normalizeReactionCounts({ like: 3, love: 1 })).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 3,
      love: 1,
    })
  })

  test("drops unknown reaction keys", () => {
    expect(normalizeReactionCounts({ like: 2, fire: 9 })).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 2,
    })
  })

  test("coerces numeric strings and floors fractional counts", () => {
    expect(normalizeReactionCounts({ like: "5", wow: 2.9 })).toEqual({
      ...EMPTY_REACTION_COUNTS,
      like: 5,
      wow: 2,
    })
  })

  test("clamps negative, NaN and non-numeric counts to zero", () => {
    expect(
      normalizeReactionCounts({ like: -3, love: "abc", haha: null })
    ).toEqual(EMPTY_REACTION_COUNTS)
  })

  test("does not mutate the shared EMPTY_REACTION_COUNTS singleton", () => {
    const result = normalizeReactionCounts({ like: 1 })
    result.like = 99
    expect(EMPTY_REACTION_COUNTS.like).toBe(0)
  })
})

describe("normalizeReactionNames", () => {
  test("returns all-empty arrays for null / undefined / non-object", () => {
    expect(normalizeReactionNames(null)).toEqual(EMPTY_REACTION_NAMES)
    expect(normalizeReactionNames(undefined)).toEqual(EMPTY_REACTION_NAMES)
    expect(normalizeReactionNames(7)).toEqual(EMPTY_REACTION_NAMES)
  })

  test("fills known reactions with their name arrays", () => {
    expect(
      normalizeReactionNames({ like: ["Alice", "Bob"], love: ["Carol"] })
    ).toEqual({
      ...EMPTY_REACTION_NAMES,
      like: ["Alice", "Bob"],
      love: ["Carol"],
    })
  })

  test("drops unknown keys and non-array values", () => {
    expect(
      normalizeReactionNames({ like: ["Alice"], fire: ["X"], wow: "nope" })
    ).toEqual({
      ...EMPTY_REACTION_NAMES,
      like: ["Alice"],
    })
  })

  test("filters out non-string entries within a name array", () => {
    expect(normalizeReactionNames({ haha: ["Alice", 3, null, "Bob"] })).toEqual(
      {
        ...EMPTY_REACTION_NAMES,
        haha: ["Alice", "Bob"],
      }
    )
  })

  test("does not mutate the shared EMPTY_REACTION_NAMES singleton", () => {
    const result = normalizeReactionNames({ like: ["Alice"] })
    result.like.push("Mallory")
    expect(EMPTY_REACTION_NAMES.like).toEqual([])
  })
})
