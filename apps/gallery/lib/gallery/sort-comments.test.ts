import { describe, expect, test } from "bun:test"

import { flattenGalleryComments } from "@/lib/gallery/sort-comments"
import type { GalleryComment } from "@/lib/gallery/types"

function comment(
  overrides: Partial<GalleryComment> & Pick<GalleryComment, "id">
): GalleryComment {
  return {
    image_id: "img-1",
    parent_id: null,
    body: "hello",
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    pinned_at: null,
    commenter_name: "Alice",
    like_count: 0,
    liked_by_me: false,
    ...overrides,
  }
}

describe("flattenGalleryComments", () => {
  test("pins top-level comment before others", () => {
    const flattened = flattenGalleryComments([
      comment({ id: "a", created_at: "2026-01-01T00:00:00.000Z" }),
      comment({
        id: "b",
        created_at: "2026-01-02T00:00:00.000Z",
        pinned_at: "2026-01-03T00:00:00.000Z",
      }),
    ])

    expect(flattened.map((row) => row.id)).toEqual(["b", "a"])
  })

  test("keeps replies under their parent", () => {
    const flattened = flattenGalleryComments([
      comment({ id: "root", created_at: "2026-01-01T00:00:00.000Z" }),
      comment({
        id: "reply",
        parent_id: "root",
        created_at: "2026-01-02T00:00:00.000Z",
      }),
    ])

    expect(flattened.map((row) => row.id)).toEqual(["root", "reply"])
    expect(flattened[1]?.depth).toBe(1)
  })
})
