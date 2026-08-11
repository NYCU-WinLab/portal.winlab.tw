import { describe, expect, test } from "bun:test"

import {
  compareGallerySearchRank,
  gallerySearchMatchScore,
  rankGallerySearchResults,
  sqlSearchRankBand,
} from "@/lib/gallery/rank-search"

const base = {
  pinned_at: null as string | null,
  created_at: "2026-08-01T00:00:00.000Z",
  tags: [] as Array<{ name: string; slug: string }>,
  sequence_items: [] as Array<{
    tags?: Array<{ name: string; slug: string }> | null
  }>,
}

describe("gallerySearchMatchScore", () => {
  test("prefers exact / prefix / contains title over tags", () => {
    expect(
      gallerySearchMatchScore(
        { ...base, id: "1", name: "Lab trip" },
        "lab trip"
      )
    ).toBe(0)
    expect(
      gallerySearchMatchScore(
        { ...base, id: "2", name: "Lab trip night" },
        "lab"
      )
    ).toBe(1)
    expect(
      gallerySearchMatchScore(
        { ...base, id: "3", name: "Night lab snacks" },
        "lab"
      )
    ).toBe(2)
    expect(
      gallerySearchMatchScore(
        {
          ...base,
          id: "4",
          name: "Untitled",
          tags: [{ name: "Lab", slug: "lab" }],
        },
        "lab"
      )
    ).toBe(3)
  })
})

describe("rankGallerySearchResults", () => {
  test("orders title matches ahead of tag matches", () => {
    const ranked = rankGallerySearchResults(
      [
        {
          ...base,
          id: "tag",
          name: "Untitled",
          tags: [{ name: "BBQ", slug: "bbq" }],
          created_at: "2026-08-02T00:00:00.000Z",
        },
        {
          ...base,
          id: "title",
          name: "BBQ night",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      ],
      "bbq"
    )
    expect(ranked.map((row) => row.id)).toEqual(["title", "tag"])
  })

  test("no-ops without a query", () => {
    const images = [
      { ...base, id: "a", name: "A" },
      { ...base, id: "b", name: "B" },
    ]
    expect(rankGallerySearchResults(images, null).map((r) => r.id)).toEqual([
      "a",
      "b",
    ])
  })
})

describe("compareGallerySearchRank", () => {
  test("breaks ties with pinned then newer", () => {
    const older = {
      ...base,
      id: "old",
      name: "Lab",
      created_at: "2026-01-01T00:00:00.000Z",
    }
    const newerPinned = {
      ...base,
      id: "new",
      name: "Lab",
      pinned_at: "2026-08-01T00:00:00.000Z",
      created_at: "2026-02-01T00:00:00.000Z",
    }
    expect(compareGallerySearchRank(newerPinned, older, "lab")).toBeLessThan(0)
  })
})

describe("sqlSearchRankBand", () => {
  test("mirrors SQL rank integers", () => {
    expect(sqlSearchRankBand("exact")).toBe(0)
    expect(sqlSearchRankBand("tag")).toBe(3)
  })
})
