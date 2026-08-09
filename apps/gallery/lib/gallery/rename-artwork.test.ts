import { describe, expect, test } from "bun:test"

import {
  applyArtworkRenamePatches,
  buildSequenceRenamePatches,
  normalizeArtworkRenameDraft,
  shouldCascadeSequenceRename,
} from "@/lib/gallery/rename-artwork"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  type GalleryImage,
} from "@/lib/gallery/types"

function stubImage(overrides: Partial<GalleryImage> = {}): GalleryImage {
  return {
    id: "cover",
    name: "Old title",
    uploader_name: "Ada",
    image_path: "a.jpg",
    media_type: "image",
    poster_path: null,
    duration_seconds: null,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    pinned_at: null,
    sequence_id: "seq-1",
    sequence_index: 0,
    sequence_count: 3,
    sequence_items: [
      {
        id: "cover",
        name: "Old title",
        image_path: "a.jpg",
        media_type: "image",
        poster_path: null,
        created_at: "2026-01-01T00:00:00Z",
        sequence_index: 0,
      },
      {
        id: "shot-1",
        name: "Old title1",
        image_path: "b.jpg",
        media_type: "image",
        poster_path: null,
        created_at: "2026-01-01T00:00:01Z",
        sequence_index: 1,
      },
      {
        id: "shot-2",
        name: "Old title2",
        image_path: "c.jpg",
        media_type: "image",
        poster_path: null,
        created_at: "2026-01-01T00:00:02Z",
        sequence_index: 2,
      },
    ],
    sequence_missing_indexes: [],
    comments: [],
    comment_count: 0,
    reaction_counts: EMPTY_REACTION_COUNTS,
    my_reaction: null,
    reaction_names: EMPTY_REACTION_NAMES,
    ...overrides,
  }
}

describe("normalizeArtworkRenameDraft", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeArtworkRenameDraft("  hello\n\tworld  ")).toBe(
      "hello world"
    )
  })

  test("empty draft becomes Untitled", () => {
    expect(normalizeArtworkRenameDraft("   ")).toBe("Untitled")
  })
})

describe("buildSequenceRenamePatches", () => {
  test("cascades cover base name across burst indexes", () => {
    expect(
      buildSequenceRenamePatches(
        [
          { id: "cover", sequence_index: 0 },
          { id: "shot-1", sequence_index: 1 },
          { id: "shot-2", sequence_index: 2 },
        ],
        "  Lab night  "
      )
    ).toEqual([
      { id: "cover", name: "Lab night" },
      { id: "shot-1", name: "Lab night1" },
      { id: "shot-2", name: "Lab night2" },
    ])
  })

  test("falls back to array order when sequence_index is null", () => {
    expect(
      buildSequenceRenamePatches(
        [
          { id: "a", sequence_index: null },
          { id: "b", sequence_index: null },
        ],
        "Burst"
      )
    ).toEqual([
      { id: "a", name: "Burst" },
      { id: "b", name: "Burst1" },
    ])
  })
})

describe("shouldCascadeSequenceRename", () => {
  test("only cover shots cascade", () => {
    expect(shouldCascadeSequenceRename("seq", 0)).toBe(true)
    expect(shouldCascadeSequenceRename("seq", 2)).toBe(false)
    expect(shouldCascadeSequenceRename(null, 0)).toBe(false)
  })
})

describe("applyArtworkRenamePatches", () => {
  test("updates cover and sequence strip names", () => {
    const next = applyArtworkRenamePatches(stubImage(), [
      { id: "cover", name: "Lab night" },
      { id: "shot-1", name: "Lab night1" },
      { id: "shot-2", name: "Lab night2" },
    ])
    expect(next.name).toBe("Lab night")
    expect(next.sequence_items.map((item) => item.name)).toEqual([
      "Lab night",
      "Lab night1",
      "Lab night2",
    ])
  })

  test("no-ops when patches miss this card", () => {
    const image = stubImage()
    expect(
      applyArtworkRenamePatches(image, [{ id: "other", name: "Nope" }])
    ).toBe(image)
  })
})
