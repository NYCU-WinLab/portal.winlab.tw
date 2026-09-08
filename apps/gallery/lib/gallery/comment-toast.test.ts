import { describe, expect, test } from "bun:test"

import {
  describeAddCommentPlaceholder,
  describeCommentDeleted,
  describeCommentPosted,
  describeCommentUpdated,
  describeMentionSomeoneAriaLabel,
  describeReplyCommentPlaceholder,
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

describe("comment chrome labels", () => {
  test("placeholders", () => {
    expect(describeAddCommentPlaceholder()).toBe("Add a comment… @ to mention")
    expect(describeReplyCommentPlaceholder()).toBe(
      "Write a reply… @ to mention"
    )
  })

  test("mention aria-label", () => {
    expect(describeMentionSomeoneAriaLabel()).toBe("Mention someone")
  })
})
