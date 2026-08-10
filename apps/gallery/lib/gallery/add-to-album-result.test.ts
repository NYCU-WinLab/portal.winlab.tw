import { describe, expect, test } from "bun:test"

import {
  describeAddToAlbumResult,
  describeCreateAlbumStarted,
} from "@/lib/gallery/add-to-album-result"

describe("describeAddToAlbumResult", () => {
  test("message when nothing new was added", () => {
    expect(
      describeAddToAlbumResult({
        added: 0,
        selected: 3,
        albumTitle: "Retreat",
      })
    ).toEqual({
      kind: "message",
      title: "Already in that album (or nothing new to add).",
    })
  })

  test("partial add mentions skipped duplicates", () => {
    expect(
      describeAddToAlbumResult({
        added: 2,
        selected: 5,
        albumTitle: "Retreat",
      })
    ).toEqual({
      kind: "success",
      title:
        "Added 2 of 5 to Retreat (duplicates skipped or album near the 200 cap)",
    })
  })

  test("full add is short", () => {
    expect(
      describeAddToAlbumResult({
        added: 3,
        selected: 3,
        albumTitle: "Retreat",
      })
    ).toEqual({
      kind: "success",
      title: "Added 3 to Retreat",
    })
  })
})

describe("describeCreateAlbumStarted", () => {
  test("mentions photo count when present", () => {
    expect(describeCreateAlbumStarted({ title: "New", added: 1 })).toBe(
      "Started New with 1 photo"
    )
    expect(describeCreateAlbumStarted({ title: "New", added: 4 })).toBe(
      "Started New with 4 photos"
    )
  })

  test("falls back without a count", () => {
    expect(describeCreateAlbumStarted({ title: "Empty", added: 0 })).toBe(
      "Started Empty"
    )
  })
})
