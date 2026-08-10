import { describe, expect, test } from "bun:test"

import {
  mergeGalleryWallPage,
  restoreGalleryWallOrder,
  shuffleGalleryWallOrder,
} from "@/lib/gallery/wall-shuffle"

describe("shuffleGalleryWallOrder", () => {
  test("returns a new array of the same length and members", () => {
    const input = [1, 2, 3, 4, 5]
    const out = shuffleGalleryWallOrder(input)
    expect(out).not.toBe(input)
    expect(out).toHaveLength(input.length)
    expect([...out].sort()).toEqual([...input].sort())
  })

  test("handles empty and singleton", () => {
    expect(shuffleGalleryWallOrder([])).toEqual([])
    expect(shuffleGalleryWallOrder(["only"])).toEqual(["only"])
  })
})

describe("mergeGalleryWallPage", () => {
  test("appends when not shuffled", () => {
    const prev = [{ id: "a" }, { id: "b" }]
    const result = mergeGalleryWallPage(prev, [{ id: "c" }, { id: "a" }], false)
    expect(result.images.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(result.addedIds).toEqual(["c"])
  })

  test("inserts fresh ids when shuffled without dropping existing", () => {
    const prev = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const result = mergeGalleryWallPage(prev, [{ id: "d" }, { id: "e" }], true)
    expect(result.addedIds.sort()).toEqual(["d", "e"])
    expect(result.images).toHaveLength(5)
    expect(result.images.map((i) => i.id).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
  })

  test("returns prev copy when incoming is empty or all duplicates", () => {
    const prev = [{ id: "a" }]
    const empty = mergeGalleryWallPage(prev, [], false)
    expect(empty.images).toEqual(prev)
    expect(empty.images).not.toBe(prev)
    expect(empty.addedIds).toEqual([])

    const dupes = mergeGalleryWallPage(prev, [{ id: "a" }, { id: "a" }], true)
    expect(dupes.images.map((i) => i.id)).toEqual(["a"])
    expect(dupes.addedIds).toEqual([])
  })
})

describe("restoreGalleryWallOrder", () => {
  test("restores by load-order ids", () => {
    const images = [{ id: "c" }, { id: "a" }, { id: "b" }]
    expect(
      restoreGalleryWallOrder(images, ["a", "b", "c"]).map((i) => i.id)
    ).toEqual(["a", "b", "c"])
  })

  test("skips unknown ids and appends leftovers", () => {
    const images = [{ id: "a" }, { id: "b" }, { id: "c" }]
    expect(
      restoreGalleryWallOrder(images, ["b", "missing", "b"]).map((i) => i.id)
    ).toEqual(["b", "a", "c"])
  })
})
