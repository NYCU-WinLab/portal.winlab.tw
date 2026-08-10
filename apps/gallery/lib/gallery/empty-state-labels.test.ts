import { describe, expect, test } from "bun:test"

import {
  describeAlbumStillEmptyTitle,
  describeAlbumsEmptyTitle,
  describeAlbumsNotReadyTitle,
  describeBackToTheWallLabel,
  describeMemoriesEmptyTrayTitle,
  describeMemoriesNotReadyTitle,
  describeNothingOnWallYetTitle,
} from "@/lib/gallery/empty-state-labels"

describe("empty-state labels", () => {
  test("wall and albums titles", () => {
    expect(describeNothingOnWallYetTitle()).toBe("Nothing on the wall yet")
    expect(describeAlbumsNotReadyTitle()).toBe("Albums not ready yet")
    expect(describeAlbumStillEmptyTitle()).toBe("Still empty")
    expect(describeAlbumsEmptyTitle({ query: true, mineOnly: false })).toBe(
      "No albums match that search"
    )
    expect(describeAlbumsEmptyTitle({ query: false, mineOnly: true })).toBe(
      "You have no albums yet"
    )
    expect(describeAlbumsEmptyTitle({ query: false, mineOnly: false })).toBe(
      "No albums yet"
    )
  })

  test("memories titles and back link", () => {
    expect(describeMemoriesNotReadyTitle()).toBe("Not ready yet")
    expect(describeMemoriesEmptyTrayTitle()).toBe("Empty tray")
    expect(describeBackToTheWallLabel()).toBe("Back to the wall")
  })
})
