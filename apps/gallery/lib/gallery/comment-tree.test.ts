import { describe, expect, test } from "bun:test"

import { removeCommentWithDescendants } from "@/lib/gallery/comment-tree"

type Row = { id: string; parent_id: string | null; body: string }

describe("removeCommentWithDescendants", () => {
  const tree: Row[] = [
    { id: "a", parent_id: null, body: "root" },
    { id: "b", parent_id: "a", body: "reply" },
    { id: "c", parent_id: "b", body: "nested" },
    { id: "d", parent_id: null, body: "other" },
  ]

  test("removes the target and its descendants only", () => {
    expect(removeCommentWithDescendants(tree, "a").map((r) => r.id)).toEqual([
      "d",
    ])
    expect(removeCommentWithDescendants(tree, "b").map((r) => r.id)).toEqual([
      "a",
      "d",
    ])
  })

  test("no-ops when the id is missing", () => {
    expect(removeCommentWithDescendants(tree, "missing")).toEqual(tree)
  })

  test("returns empty for empty list", () => {
    expect(removeCommentWithDescendants([], "a")).toEqual([])
  })
})
