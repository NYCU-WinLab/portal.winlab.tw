import { describe, expect, test } from "bun:test"

import {
  isGalleryCommentLikesUnavailable,
  loadGalleryCommentRowsWithSocial,
} from "@/lib/gallery/comment-social"

describe("isGalleryCommentLikesUnavailable", () => {
  test("detects missing likes table", () => {
    expect(
      isGalleryCommentLikesUnavailable({
        code: "PGRST205",
        message:
          "Could not find the table 'public.gallery_comment_likes' in the schema cache",
      })
    ).toBe(true)
  })

  test("ignores unrelated errors", () => {
    expect(
      isGalleryCommentLikesUnavailable({
        code: "42501",
        message: "permission denied",
      })
    ).toBe(false)
  })
})

type MockError = { code?: string; message?: string } | null

function mockCommentClient(options: {
  fullError?: MockError
  editError?: MockError
  baseError?: MockError
  likesError?: MockError
  fullRows?: Array<Record<string, unknown>>
  editRows?: Array<Record<string, unknown>>
  baseRows?: Array<Record<string, unknown>>
}) {
  const fullRows = options.fullRows ?? [
    {
      id: "c1",
      image_id: "i1",
      parent_id: null,
      body: "hi",
      created_by: "u1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: null,
      pinned_at: null,
    },
  ]
  const editRows =
    options.editRows ?? fullRows.map(({ pinned_at: _, ...row }) => row)
  const baseRows =
    options.baseRows ?? editRows.map(({ updated_at: __, ...row }) => row)

  return {
    from(table: string) {
      if (table === "gallery_comment_likes") {
        return {
          select() {
            return {
              in() {
                return Promise.resolve({
                  data: [],
                  error: options.likesError ?? null,
                })
              },
            }
          },
        }
      }

      let selectCall = 0
      return {
        select(columns: string) {
          selectCall += 1
          const call = selectCall
          return {
            in() {
              return {
                order() {
                  if (call === 1 && /pinned_at/.test(columns)) {
                    return Promise.resolve({
                      data: options.fullError ? null : fullRows,
                      error: options.fullError ?? null,
                    })
                  }
                  if (call === 2 && /updated_at/.test(columns)) {
                    return Promise.resolve({
                      data: options.editError ? null : editRows,
                      error: options.editError ?? null,
                    })
                  }
                  return Promise.resolve({
                    data: options.baseError ? null : baseRows,
                    error: options.baseError ?? null,
                  })
                },
              }
            },
          }
        },
      }
    },
  } as never
}

describe("loadGalleryCommentRowsWithSocial", () => {
  test("marks pin+likes available when full select succeeds", async () => {
    const result = await loadGalleryCommentRowsWithSocial(
      mockCommentClient({}),
      ["i1"],
      "u1"
    )
    expect(result.error).toBeNull()
    expect(result.commentPinAvailable).toBe(true)
    expect(result.commentLikesAvailable).toBe(true)
    expect(result.rows).toHaveLength(1)
  })

  test("peels pinned_at and marks pin unavailable", async () => {
    const result = await loadGalleryCommentRowsWithSocial(
      mockCommentClient({
        fullError: {
          code: "PGRST204",
          message: "Could not find the 'pinned_at' column",
        },
      }),
      ["i1"],
      null
    )
    expect(result.error).toBeNull()
    expect(result.commentPinAvailable).toBe(false)
    expect(result.commentLikesAvailable).toBe(true)
    expect(result.rows[0]?.pinned_at ?? null).toBeNull()
  })

  test("marks likes unavailable when likes table is missing", async () => {
    const result = await loadGalleryCommentRowsWithSocial(
      mockCommentClient({
        likesError: {
          code: "PGRST205",
          message: "Could not find the table 'public.gallery_comment_likes'",
        },
      }),
      ["i1"],
      null
    )
    expect(result.error).toBeNull()
    expect(result.commentLikesAvailable).toBe(false)
    expect(result.rows).toHaveLength(1)
  })
})
