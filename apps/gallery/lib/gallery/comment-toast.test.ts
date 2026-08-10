import { describe, expect, test } from "bun:test"

import {
  describeCommentDeleted,
  describeCommentPosted,
  describeCommentUpdated,
} from "@/lib/gallery/comment-toast"

describe("comment toast helpers", () => {
  test("describeCommentPosted", () => {
    expect(describeCommentPosted()).toBe("Comment posted.")
  })

  test("describeCommentDeleted", () => {
    expect(describeCommentDeleted()).toBe("Comment deleted.")
  })

  test("describeCommentUpdated", () => {
    expect(describeCommentUpdated()).toBe("Comment updated.")
  })
})
