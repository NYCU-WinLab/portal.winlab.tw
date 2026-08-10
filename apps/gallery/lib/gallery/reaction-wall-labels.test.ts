import { describe, expect, test } from "bun:test"

import {
  describeChooseReactionAriaLabel,
  describeGalleryWallAriaLabel,
  describeShowWhoReactedAriaLabel,
} from "@/lib/gallery/reaction-wall-labels"

describe("reaction and wall region labels", () => {
  test("aria-labels", () => {
    expect(describeShowWhoReactedAriaLabel()).toBe("Show who reacted")
    expect(describeChooseReactionAriaLabel()).toContain("Choose a reaction")
    expect(describeChooseReactionAriaLabel().toLowerCase()).toContain("enter")
    expect(describeChooseReactionAriaLabel().length).toBeLessThan(120)
    expect(describeGalleryWallAriaLabel()).toBe("Gallery wall")
  })
})
