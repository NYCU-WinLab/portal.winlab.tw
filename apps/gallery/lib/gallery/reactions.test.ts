import { describe, expect, test } from "bun:test"

import {
  EMPTY_REACTION_COUNTS,
  formatReactionSummary,
  isGalleryReaction,
  totalReactions,
} from "@/lib/gallery/reactions"

describe("isGalleryReaction", () => {
  test("accepts known reactions", () => {
    expect(isGalleryReaction("like")).toBe(true)
    expect(isGalleryReaction("love")).toBe(true)
    expect(isGalleryReaction("point")).toBe(true)
  })

  test("rejects unknown values", () => {
    expect(isGalleryReaction("wow")).toBe(false)
  })
})

describe("formatReactionSummary", () => {
  test("omits zero counts", () => {
    expect(
      formatReactionSummary({ like: 2, love: 0, point: 1 })
    ).toBe("👍 2 · 👉👈 1")
  })

  test("returns empty string when no reactions", () => {
    expect(formatReactionSummary(EMPTY_REACTION_COUNTS)).toBe("")
  })
})

describe("totalReactions", () => {
  test("sums all kinds", () => {
    expect(totalReactions({ like: 1, love: 2, point: 3 })).toBe(6)
  })
})
