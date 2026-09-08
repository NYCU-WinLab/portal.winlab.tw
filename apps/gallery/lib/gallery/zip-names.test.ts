import { describe, expect, test } from "bun:test"

import {
  albumIndexPadWidth,
  buildAlbumEntryName,
  buildAlbumZipFilename,
  buildSequenceEntryName,
  buildSequenceZipFilename,
  ensureExtension,
  extensionFromPath,
  safeFolderName,
  sortAlbumZipItems,
  sortSequenceZipItems,
  uniquifyName,
} from "@/lib/gallery/zip-names"

describe("safeFolderName", () => {
  test("replaces path-hostile characters", () => {
    expect(safeFolderName('Lab: "party"/day')).toBe("Lab_party_day")
  })

  test("falls back when empty", () => {
    expect(safeFolderName("   ")).toBe("unknown")
    expect(safeFolderName("::")).toBe("unknown")
  })
})

describe("uniquifyName", () => {
  test("keeps first occurrence", () => {
    const used = new Set<string>()
    expect(uniquifyName(used, "a.jpg")).toBe("a.jpg")
    expect(uniquifyName(used, "a.jpg")).toBe("a (2).jpg")
    expect(uniquifyName(used, "a.jpg")).toBe("a (3).jpg")
  })
})

describe("extensionFromPath / ensureExtension", () => {
  test("reads extension from storage path", () => {
    expect(extensionFromPath("user/uuid.JPG")).toBe(".JPG")
    expect(extensionFromPath("user/noext")).toBe("")
  })

  test("keeps names that already have an extension", () => {
    expect(ensureExtension("cover.png", "user/uuid.jpg")).toBe("cover.png")
  })

  test("borrows extension when display name has none", () => {
    expect(ensureExtension("cover", "user/uuid.mp4")).toBe("cover.mp4")
  })

  test("falls back to path basename when name is blank", () => {
    expect(ensureExtension("  ", "user/shot.webp")).toBe("shot.webp")
  })
})

describe("sortSequenceZipItems", () => {
  test("orders by sequence_index then original order", () => {
    const sorted = sortSequenceZipItems([
      { name: "c", image_path: "c.jpg", sequence_index: 2 },
      { name: "a", image_path: "a.jpg", sequence_index: 0 },
      { name: "orphan", image_path: "o.jpg", sequence_index: null },
      { name: "b", image_path: "b.jpg", sequence_index: 1 },
    ])
    expect(sorted.map((item) => item.name)).toEqual(["a", "b", "c", "orphan"])
  })
})

describe("buildSequenceEntryName", () => {
  test("prefixes padded index", () => {
    const used = new Set<string>()
    expect(
      buildSequenceEntryName(used, 0, {
        name: "shot",
        image_path: "u/a.jpg",
      })
    ).toBe("01_shot.jpg")
    expect(
      buildSequenceEntryName(used, 1, {
        name: "shot",
        image_path: "u/b.jpg",
      })
    ).toBe("02_shot.jpg")
  })

  test("uniquifies when the padded name collides", () => {
    const used = new Set<string>(["01_shot.jpg"])
    expect(
      buildSequenceEntryName(used, 0, {
        name: "shot",
        image_path: "u/a.jpg",
      })
    ).toBe("01_shot (2).jpg")
  })
})

describe("buildSequenceZipFilename", () => {
  test("suffixes -story.zip on a safe folder name", () => {
    expect(buildSequenceZipFilename("Friday BBQ")).toBe("Friday_BBQ-story.zip")
  })
})

describe("sortAlbumZipItems", () => {
  test("orders by position then original order", () => {
    const sorted = sortAlbumZipItems([
      { name: "c", image_path: "c.jpg", position: 2 },
      { name: "a", image_path: "a.jpg", position: 0 },
      { name: "orphan", image_path: "o.jpg", position: null },
      { name: "b", image_path: "b.jpg", position: 1 },
    ])
    expect(sorted.map((item) => item.name)).toEqual(["a", "b", "c", "orphan"])
  })
})

describe("buildAlbumEntryName", () => {
  test("pads to total width for large albums", () => {
    expect(albumIndexPadWidth(100)).toBe(3)
    const used = new Set<string>()
    expect(
      buildAlbumEntryName(used, 0, { name: "shot", image_path: "u/a.jpg" }, 100)
    ).toBe("001_shot.jpg")
  })

  test("uses two digits for small albums", () => {
    const used = new Set<string>()
    expect(
      buildAlbumEntryName(used, 0, { name: "shot", image_path: "u/a.jpg" }, 3)
    ).toBe("01_shot.jpg")
  })
})

describe("buildAlbumZipFilename", () => {
  test("suffixes -album.zip on a safe folder name", () => {
    expect(buildAlbumZipFilename("Lab trip")).toBe("Lab_trip-album.zip")
  })
})
