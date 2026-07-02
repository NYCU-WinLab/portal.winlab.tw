import { describe, expect, test } from "bun:test"

import {
  groupManageUploads,
  swapSequenceOrder,
} from "@/lib/gallery/manage-uploads"
import { resolveWallPhotoId } from "@/lib/gallery/wall-photo-id"

describe("resolveWallPhotoId", () => {
  test("returns cover id for non-cover sequence shots", () => {
    const siblings = [
      { id: "cover", sequence_id: "seq-1", sequence_index: 0 },
      { id: "shot-2", sequence_id: "seq-1", sequence_index: 1 },
    ]
    expect(resolveWallPhotoId(siblings[1]!, siblings)).toBe("cover")
  })
})

describe("groupManageUploads", () => {
  test("groups sequence rows and keeps singles separate", () => {
    const rows = [
      {
        id: "a",
        name: "A",
        image_path: "u/a.jpg",
        media_type: "image" as const,
        poster_path: null,
        duration_seconds: null,
        created_at: "2026-01-02T00:00:00.000Z",
        sequence_id: "seq",
        sequence_index: 1,
      },
      {
        id: "b",
        name: "B",
        image_path: "u/b.jpg",
        media_type: "image" as const,
        poster_path: null,
        duration_seconds: null,
        created_at: "2026-01-01T00:00:00.000Z",
        sequence_id: "seq",
        sequence_index: 0,
      },
      {
        id: "solo",
        name: "Solo",
        image_path: "u/solo.jpg",
        media_type: "image" as const,
        poster_path: null,
        duration_seconds: null,
        created_at: "2026-01-03T00:00:00.000Z",
        sequence_id: null,
        sequence_index: null,
      },
    ]

    const grouped = groupManageUploads(rows)
    expect(grouped.singles).toHaveLength(1)
    expect(grouped.sequences).toHaveLength(1)
    expect(grouped.sequences[0]?.items.map((item) => item.id)).toEqual([
      "b",
      "a",
    ])
  })
})

describe("swapSequenceOrder", () => {
  test("moves an item to a new index", () => {
    expect(swapSequenceOrder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"])
  })
})
