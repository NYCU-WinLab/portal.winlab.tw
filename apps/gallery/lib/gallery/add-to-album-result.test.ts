import { describe, expect, test } from "bun:test"

import {
  describeAddToAlbumResult,
  describeAddToAlbumDialogDescription,
  describeAddToAlbumDialogTitle,
  describeAddToAlbumTriggerLabel,
  describeAlbumCreateRollbackError,
  describeCreateAlbumAndAddPhotosAriaLabel,
  describeCreateAlbumStarted,
  describeNewAlbumTitlePlaceholder,
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

describe("describeAddToAlbumTriggerLabel", () => {
  test("singular vs plural selection", () => {
    expect(describeAddToAlbumTriggerLabel(1)).toBe("Add to album")
    expect(describeAddToAlbumTriggerLabel(0)).toBe("Add to album")
    expect(describeAddToAlbumTriggerLabel(3)).toBe("Add 3 to album")
  })
})

describe("describeAddToAlbumDialogTitle", () => {
  test("singular vs plural selection", () => {
    expect(describeAddToAlbumDialogTitle(1)).toBe("Add to album")
    expect(describeAddToAlbumDialogTitle(0)).toBe("Add to album")
    expect(describeAddToAlbumDialogTitle(4)).toBe("Add 4 photos to album")
  })
})

describe("describeAddToAlbumDialogDescription", () => {
  test("singular vs plural selection", () => {
    expect(describeAddToAlbumDialogDescription(1)).toBe(
      "Curate this shot into one of your collections. Share links live at /albums/<slug>."
    )
    expect(describeAddToAlbumDialogDescription(3)).toBe(
      "Curate the selected wall covers into one of your collections."
    )
  })
})

describe("describeAlbumCreateRollbackError", () => {
  test("warns that an empty album may remain", () => {
    expect(
      describeAlbumCreateRollbackError({
        title: "Retreat",
        addError: "Album is full.",
      })
    ).toBe(
      "Album is full. Album “Retreat” may still exist empty — delete it from Albums."
    )
  })
})

describe("describeCreateAlbumAndAddPhotosAriaLabel", () => {
  test("create-and-add control", () => {
    expect(describeCreateAlbumAndAddPhotosAriaLabel()).toBe(
      "Create album and add photos"
    )
    expect(describeNewAlbumTitlePlaceholder()).toBe("New album title")
  })
})
