import { describe, expect, test } from "bun:test"

import { applyExclusiveCommentPin } from "@/lib/gallery/comment-pin"

type Row = {
  id: string
  image_id: string
  parent_id: string | null
  pinned_at: string | null
}

describe("applyExclusiveCommentPin", () => {
  const rows: Row[] = [
    {
      id: "a",
      image_id: "img",
      parent_id: null,
      pinned_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "b",
      image_id: "img",
      parent_id: null,
      pinned_at: null,
    },
    {
      id: "c",
      image_id: "img",
      parent_id: "a",
      pinned_at: null,
    },
    {
      id: "d",
      image_id: "other",
      parent_id: null,
      pinned_at: "2026-01-01T00:00:00.000Z",
    },
  ]

  test("pins one top-level comment and clears siblings on the same image", () => {
    const next = applyExclusiveCommentPin(
      rows,
      { id: "b", image_id: "img" },
      true,
      "2026-02-01T00:00:00.000Z"
    )
    expect(next.find((r) => r.id === "a")?.pinned_at).toBeNull()
    expect(next.find((r) => r.id === "b")?.pinned_at).toBe(
      "2026-02-01T00:00:00.000Z"
    )
    expect(next.find((r) => r.id === "c")?.pinned_at).toBeNull()
    expect(next.find((r) => r.id === "d")?.pinned_at).toBe(
      "2026-01-01T00:00:00.000Z"
    )
  })

  test("unpin leaves other pins alone", () => {
    const next = applyExclusiveCommentPin(
      rows,
      { id: "a", image_id: "img" },
      false,
      null
    )
    expect(next.find((r) => r.id === "a")?.pinned_at).toBeNull()
    expect(next.find((r) => r.id === "b")?.pinned_at).toBeNull()
    expect(next.find((r) => r.id === "d")?.pinned_at).toBe(
      "2026-01-01T00:00:00.000Z"
    )
  })
})
