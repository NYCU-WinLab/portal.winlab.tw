import { describe, expect, test } from "bun:test"

import {
  EMPTY_REACTION_COUNTS,
  formatReactionSummary,
  isGalleryReaction,
  totalReactions,
} from "@/lib/gallery/reactions"

describe("isGalleryReaction", () => {
  test("accepts Facebook-style and point reactions", () => {
    expect(isGalleryReaction("like")).toBe(true)
    expect(isGalleryReaction("haha")).toBe(true)
    expect(isGalleryReaction("angry")).toBe(true)
    expect(isGalleryReaction("point")).toBe(true)
  })

  test("rejects unknown values", () => {
    expect(isGalleryReaction("fire")).toBe(false)
  })
})

describe("formatReactionSummary", () => {
  test("omits zero counts", () => {
    expect(
      formatReactionSummary({ ...EMPTY_REACTION_COUNTS, like: 2, haha: 1 })
    ).toBe("👍 2 · 😂 1")
  })

  test("returns empty string when no reactions", () => {
    expect(formatReactionSummary(EMPTY_REACTION_COUNTS)).toBe("")
  })
})

describe("totalReactions", () => {
  test("sums all kinds", () => {
    expect(
      totalReactions({ ...EMPTY_REACTION_COUNTS, like: 1, angry: 2, point: 1 })
    ).toBe(4)
  })
})
