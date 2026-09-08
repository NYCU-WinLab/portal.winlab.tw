import { describe, expect, test } from "bun:test"

import {
  describeAlbumStillEmptyTitle,
  describeAlbumsEmptyTitle,
  describeAlbumsNotReadyTitle,
  describeBackToTheWallLabel,
  describeBrowseTheWallLabel,
  describeClearSearchLabel,
  describeNoSavedPhotosDescription,
  describeNoSavedPhotosTitle,
  describeMemoriesEmptyTrayTitle,
  describeMemoriesNotReadyTitle,
  describeNothingOnWallYetTitle,
  describeAlbumStillEmptyDescription,
  describeAlbumsEmptyDescription,
  describeAlbumsNotReadyDescription,
  describeAlbumPageNotReadyDescription,
  describeMemoriesEmptyTrayDescription,
  describeMemoriesNotReadyDescription,
  describeNothingOnWallYetDescription,
  describePaperWallThemeLabel,
  describeShowAllAlbumsLabel,
  describeSignInToUploadLabel,
  describeUploadAPhotoLabel,
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

  test("descriptions and CTAs", () => {
    expect(describeNothingOnWallYetDescription()).toBe(
      "Hang the first polaroid — the lab wall is waiting."
    )
    expect(describeUploadAPhotoLabel()).toBe("Upload a photo")
    expect(describeSignInToUploadLabel()).toBe("Sign in to upload")
    expect(describeBrowseTheWallLabel()).toBe("Browse the wall")
    expect(describeClearSearchLabel()).toBe("Clear search")
    expect(describeNoSavedPhotosTitle()).toBe("No saved photos yet")
    expect(describeNoSavedPhotosDescription()).toContain("bookmark")
    expect(describeShowAllAlbumsLabel()).toBe("Show all albums")
    expect(describePaperWallThemeLabel()).toBe("Paper wall")
    expect(describeAlbumStillEmptyDescription(true)).toContain("Add to album")
    expect(describeAlbumStillEmptyDescription(false)).toContain("curator")
    expect(
      describeAlbumsEmptyDescription({
        query: true,
        mineOnly: false,
        signedIn: true,
      })
    ).toContain("clear the search")
    expect(describeMemoriesEmptyTrayDescription("March 3")).toContain(
      "past March 3"
    )
  })
})
