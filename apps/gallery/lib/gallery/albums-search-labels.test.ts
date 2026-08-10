import { describe, expect, test } from "bun:test"

import {
  describeAlbumsSearchPlaceholder,
  describeClearAlbumSearchAriaLabel,
  describeSearchAlbumsAriaLabel,
  describeSearchAlbumsInputAriaLabel,
} from "@/lib/gallery/albums-search-labels"

describe("albums search labels", () => {
  test("form and input aria-labels", () => {
    expect(describeSearchAlbumsAriaLabel()).toBe("Search albums")
    expect(describeSearchAlbumsInputAriaLabel()).toBe(
      "Search albums by title, slug, or owner"
    )
  })

  test("clear and placeholder", () => {
    expect(describeClearAlbumSearchAriaLabel()).toBe("Clear album search")
    expect(describeAlbumsSearchPlaceholder()).toBe("Search title, slug, owner…")
  })
})
