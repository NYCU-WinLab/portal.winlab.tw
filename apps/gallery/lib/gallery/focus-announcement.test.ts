import { describe, expect, test } from "bun:test"

import { describeFocusedPhotoAnnouncement } from "@/lib/gallery/focus-announcement"

describe("describeFocusedPhotoAnnouncement", () => {
  test("includes name and 1-based position", () => {
    expect(describeFocusedPhotoAnnouncement("Lab night", 0, 3)).toBe(
      "Lab night, 1 of 3"
    )
    expect(describeFocusedPhotoAnnouncement("Lab night", 2, 3)).toBe(
      "Lab night, 3 of 3"
    )
  })

  test("falls back when the name is blank", () => {
    expect(describeFocusedPhotoAnnouncement("  ", 0, 1)).toBe(
      "Untitled, 1 of 1"
    )
  })

  test("clamps out-of-range indexes", () => {
    expect(describeFocusedPhotoAnnouncement("A", -2, 3)).toBe("A, 1 of 3")
    expect(describeFocusedPhotoAnnouncement("A", 99, 3)).toBe("A, 3 of 3")
  })
})
