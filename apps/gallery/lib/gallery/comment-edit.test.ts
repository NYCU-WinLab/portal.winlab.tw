import { describe, expect, test } from "bun:test"

import {
  formatGallerySupabaseError,
  isGalleryCommentEditUnavailable,
  isGalleryCommentsReady,
  isGalleryCommentsUnavailable,
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

describe("isGalleryCommentsUnavailable", () => {
  test("detects missing comments table", () => {
    expect(
      isGalleryCommentsUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_comments' in the schema cache",
      })
    ).toBe(true)
  })

  test("ignores column-level soft-fails", () => {
    expect(
      isGalleryCommentsUnavailable({
        code: "PGRST204",
        message: "Could not find the 'updated_at' column of 'gallery_comments'",
      })
    ).toBe(false)
  })
})

describe("isGalleryCommentsReady", () => {
  test("is false when comments table is missing", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({
                  error: {
                    code: "PGRST205",
                    message:
                      "Could not find the table 'public.gallery_comments'",
                  },
                })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryCommentsReady(client)).toBe(false)
  })

  test("is true when the query succeeds", async () => {
    const client = {
      from() {
        return {
          select() {
            return {
              limit() {
                return Promise.resolve({ error: null })
              },
            }
          },
        }
      },
    } as never
    expect(await isGalleryCommentsReady(client)).toBe(true)
  })
})
