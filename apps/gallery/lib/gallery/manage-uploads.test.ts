import { describe, expect, test } from "bun:test"

import {
  countIncompleteSequences,
  describeSequenceGaps,
  filterIncompleteSequences,
  findSequenceGaps,
  groupManageUploads,
  looksLikeUploadDayTakenAt,
  countUploadDayRows,
  filterUploadDayRows,
  swapSequenceOrder,
  type ManageUploadRow,
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

  test("falls back to lowest index when cover is missing", () => {
    const siblings = [
      { id: "shot-2", sequence_id: "seq-1", sequence_index: 2 },
      { id: "shot-1", sequence_id: "seq-1", sequence_index: 1 },
    ]
    expect(resolveWallPhotoId(siblings[0]!, siblings)).toBe("shot-1")
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
        pinned_at: null,
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
        pinned_at: null,
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
        pinned_at: null,
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

describe("findSequenceGaps", () => {
  test("reports missing middle and cover slots", () => {
    expect(findSequenceGaps([0, 2]).gaps).toEqual([1])
    expect(findSequenceGaps([1, 2]).missingCover).toBe(true)
    expect(findSequenceGaps([1, 2]).gaps).toEqual([0])
  })

  test("describeSequenceGaps labels cover specially", () => {
    expect(describeSequenceGaps([0])).toBe("Missing cover (shot 1)")
    expect(describeSequenceGaps([1, 3])).toBe("Missing shot 2, shot 4")
  })
})

describe("looksLikeUploadDayTakenAt", () => {
  test("treats missing or near-created as upload day", () => {
    expect(looksLikeUploadDayTakenAt(null, "2026-01-01T12:00:00.000Z")).toBe(
      true
    )
    expect(
      looksLikeUploadDayTakenAt(
        "2026-01-01T12:00:30.000Z",
        "2026-01-01T12:00:00.000Z"
      )
    ).toBe(true)
    expect(
      looksLikeUploadDayTakenAt(
        "2024-08-10T03:00:00.000Z",
        "2026-01-01T12:00:00.000Z"
      )
    ).toBe(false)
  })
})

describe("countUploadDayRows", () => {
  test("counts rows that still need a real capture date", () => {
    const rows: ManageUploadRow[] = [
      {
        id: "a",
        name: "A",
        image_path: "u/a.jpg",
        media_type: "image",
        poster_path: null,
        duration_seconds: null,
        created_at: "2026-01-01T12:00:00.000Z",
        pinned_at: null,
        taken_at: null,
        sequence_id: null,
        sequence_index: null,
      },
      {
        id: "b",
        name: "B",
        image_path: "u/b.jpg",
        media_type: "image",
        poster_path: null,
        duration_seconds: null,
        created_at: "2026-01-01T12:00:00.000Z",
        pinned_at: null,
        taken_at: "2024-08-10T03:00:00.000Z",
        sequence_id: null,
        sequence_index: null,
      },
    ]
    expect(countUploadDayRows(rows)).toBe(1)
    expect(filterUploadDayRows(rows).map((row) => row.id)).toEqual(["a"])
  })
})

describe("filterIncompleteSequences", () => {
  const baseRow: ManageUploadRow = {
    id: "x",
    name: "X",
    image_path: "u/x.jpg",
    media_type: "image",
    poster_path: null,
    duration_seconds: null,
    created_at: "2026-01-01T00:00:00.000Z",
    pinned_at: null,
    sequence_id: "seq",
    sequence_index: 0,
  }

  test("keeps only sequences with gaps", () => {
    const complete = {
      sequenceId: "ok",
      items: [
        { ...baseRow, id: "a", sequence_id: "ok", sequence_index: 0 },
        { ...baseRow, id: "b", sequence_id: "ok", sequence_index: 1 },
      ],
    }
    const incomplete = {
      sequenceId: "gap",
      items: [
        { ...baseRow, id: "c", sequence_id: "gap", sequence_index: 0 },
        { ...baseRow, id: "d", sequence_id: "gap", sequence_index: 2 },
      ],
    }
    expect(
      filterIncompleteSequences([complete, incomplete]).map((s) => s.sequenceId)
    ).toEqual(["gap"])
    expect(countIncompleteSequences([complete, incomplete])).toBe(1)
  })
})
