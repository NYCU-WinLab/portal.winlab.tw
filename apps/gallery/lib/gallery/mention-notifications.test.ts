import { describe, expect, test } from "bun:test"

import {
  isGalleryMentionReadAtUnavailable,
  isGalleryMentionsTableUnavailable,
} from "@/lib/gallery/mention-notifications"

describe("isGalleryMentionsTableUnavailable", () => {
  test("detects missing mentions table", () => {
    expect(
      isGalleryMentionsTableUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_comment_mentions' in the schema cache",
      })
    ).toBe(true)
  })

  test("ignores unrelated errors", () => {
    expect(
      isGalleryMentionsTableUnavailable({
        code: "42501",
        message: "permission denied",
      })
    ).toBe(false)
  })
})

describe("isGalleryMentionReadAtUnavailable", () => {
  test("detects missing read_at column", () => {
    expect(
      isGalleryMentionReadAtUnavailable({
        code: "42703",
        message: 'column "read_at" does not exist',
      })
    ).toBe(true)
  })
})
