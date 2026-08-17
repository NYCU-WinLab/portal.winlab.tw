import { describe, expect, test } from "bun:test"

import {
  describeAlbumManageDeleteLabel,
  describeAlbumManageRemoveLabel,
  describeCancelLabel,
  describeCopyLinkLabel,
  describeCreateLabel,
  describeDeleteLabel,
  describeRemoveLabel,
  describeRetryLabel,
  describeSaveCountLabel,
  describeSaveLabel,
  describeTagLabel,
} from "@/lib/gallery/dialog-action-labels"

describe("dialog action labels", () => {
  test("cancel delete remove", () => {
    expect(describeCancelLabel()).toBe("Cancel")
    expect(describeDeleteLabel()).toBe("Delete")
    expect(describeRemoveLabel()).toBe("Remove")
  })

  test("album manage pending variants", () => {
    expect(describeAlbumManageDeleteLabel(false)).toBe("Delete")
    expect(describeAlbumManageDeleteLabel(true)).toBe("Deleting?")
    expect(describeAlbumManageRemoveLabel(false)).toBe("Remove")
    expect(describeAlbumManageRemoveLabel(true)).toBe("Removing?")
  })

  test("save tag create retry copy", () => {
    expect(describeRetryLabel()).toBe("Retry")
    expect(describeSaveLabel()).toBe("Save")
    expect(describeSaveCountLabel(0)).toBe("Save")
    expect(describeSaveCountLabel(3)).toBe("Save 3")
    expect(describeTagLabel()).toBe("Tag")
    expect(describeCreateLabel()).toBe("Create")
    expect(describeCopyLinkLabel()).toBe("Copy link")
  })
})
