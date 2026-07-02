import { describe, expect, test } from "bun:test"

import {
  formatGallerySupabaseError,
  isGalleryCommentEditUnavailable,
} from "@/lib/gallery/comment-edit"

describe("isGalleryCommentEditUnavailable", () => {
  test("detects missing updated_at column", () => {
    expect(
      isGalleryCommentEditUnavailable({
        code: "42703",
        message: "column gallery_comments.updated_at does not exist",
      })
    ).toBe(true)
  })

  test("returns false for unrelated errors", () => {
    expect(
      isGalleryCommentEditUnavailable({
        code: "42501",
        message: "permission denied",
      })
    ).toBe(false)
  })
})

describe("formatGallerySupabaseError", () => {
  test("includes message and code", () => {
    expect(
      formatGallerySupabaseError({
        code: "42703",
        message: "column does not exist",
        hint: "Perhaps you meant created_at",
      })
    ).toContain("column does not exist")
    expect(
      formatGallerySupabaseError({
        code: "42703",
        message: "column does not exist",
        hint: "Perhaps you meant created_at",
      })
    ).toContain("code=42703")
  })
})
