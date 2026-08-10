import { describe, expect, test } from "bun:test"

import { describeReactionOutcome } from "@/lib/gallery/reaction-outcome"

describe("describeReactionOutcome", () => {
  test("maps each optimistic outcome", () => {
    expect(describeReactionOutcome("removed")).toBe("Reaction removed.")
    expect(describeReactionOutcome("updated")).toBe("Reaction updated.")
    expect(describeReactionOutcome("added")).toBe("Reaction added.")
  })
})
