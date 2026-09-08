import { describe, expect, test } from "bun:test"

import { describeSequenceReorderAnnouncement } from "@/lib/gallery/reorder-announcement"

describe("describeSequenceReorderAnnouncement", () => {
  test("includes name and 1-based position", () => {
    expect(describeSequenceReorderAnnouncement("Retreat", 2, 5)).toBe(
      "Moved Retreat to position 3 of 5"
    )
  })

  test("falls back for blank names", () => {
    expect(describeSequenceReorderAnnouncement("  ", 0, 1)).toBe(
      "Moved Untitled to position 1 of 1"
    )
  })
})
