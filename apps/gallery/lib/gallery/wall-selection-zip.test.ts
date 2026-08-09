import { describe, expect, test } from "bun:test"

import { expandWallSelectionZipItems } from "@/lib/gallery/wall-selection-zip"

describe("expandWallSelectionZipItems", () => {
  test("keeps singles as one entry", () => {
    expect(
      expandWallSelectionZipItems(
        ["a"],
        [
          {
            id: "a",
            name: "Solo",
            image_path: "u/a.jpg",
            sequence_count: 1,
            sequence_items: [],
          },
        ]
      )
    ).toEqual([{ name: "Solo", image_path: "u/a.jpg", position: 0 }])
  })

  test("expands multi-shot sequences to siblings", () => {
    expect(
      expandWallSelectionZipItems(
        ["cover"],
        [
          {
            id: "cover",
            name: "Burst",
            image_path: "u/cover.jpg",
            sequence_count: 3,
            sequence_items: [
              {
                id: "cover",
                name: "Burst",
                image_path: "u/cover.jpg",
                media_type: "image",
                poster_path: null,
                created_at: "2026-01-01",
                sequence_index: 0,
                tags: [],
              },
              {
                id: "b",
                name: "Burst (2)",
                image_path: "u/b.jpg",
                media_type: "image",
                poster_path: null,
                created_at: "2026-01-01",
                sequence_index: 1,
                tags: [],
              },
              {
                id: "c",
                name: "Burst (3)",
                image_path: "u/c.jpg",
                media_type: "image",
                poster_path: null,
                created_at: "2026-01-01",
                sequence_index: 2,
                tags: [],
              },
            ],
          },
        ]
      )
    ).toEqual([
      { name: "Burst", image_path: "u/cover.jpg", position: 0 },
      { name: "Burst (2)", image_path: "u/b.jpg", position: 1 },
      { name: "Burst (3)", image_path: "u/c.jpg", position: 2 },
    ])
  })

  test("mixes singles and stories with contiguous positions", () => {
    const items = expandWallSelectionZipItems(
      ["s", "cover"],
      [
        {
          id: "s",
          name: "One",
          image_path: "u/one.jpg",
          sequence_count: 1,
          sequence_items: [],
        },
        {
          id: "cover",
          name: "Two",
          image_path: "u/two.jpg",
          sequence_count: 2,
          sequence_items: [
            {
              id: "cover",
              name: "Two",
              image_path: "u/two.jpg",
              media_type: "image",
              poster_path: null,
              created_at: "2026-01-01",
              sequence_index: 0,
              tags: [],
            },
            {
              id: "x",
              name: "Two (2)",
              image_path: "u/x.jpg",
              media_type: "image",
              poster_path: null,
              created_at: "2026-01-01",
              sequence_index: 1,
              tags: [],
            },
          ],
        },
      ]
    )
    expect(items.map((i) => i.position)).toEqual([0, 1, 2])
    expect(items).toHaveLength(3)
  })
})
