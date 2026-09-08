import { describe, expect, test } from "bun:test"

import { describeCommentPinToast } from "@/lib/gallery/comment-pin-toast"

describe("describeCommentPinToast", () => {
  test("pinned", () => {
    expect(describeCommentPinToast(true)).toBe("Comment pinned.")
  })

  test("unpinned", () => {
    expect(describeCommentPinToast(false)).toBe("Comment unpinned.")
  })
})
