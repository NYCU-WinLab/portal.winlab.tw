import { describe, expect, test } from "bun:test"

import { describeAlbumFromSelection } from "@/lib/gallery/album-from-selection"

describe("describeAlbumFromSelection", () => {
  test("mentions photo count when photos were added", () => {
    expect(describeAlbumFromSelection({ title: "Lab dinner", added: 3 })).toBe(
      "Album “Lab dinner” with 3 photos"
    )
    expect(describeAlbumFromSelection({ title: "Solo", added: 1 })).toBe(
      "Album “Solo” with 1 photo"
    )
  })

  test("falls back when nothing was added", () => {
    expect(describeAlbumFromSelection({ title: "Empty", added: 0 })).toBe(
      "Album “Empty” created"
    )
  })
})
