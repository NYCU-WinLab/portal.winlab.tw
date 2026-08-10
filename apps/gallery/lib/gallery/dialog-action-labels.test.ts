import { describe, expect, test } from "bun:test"

import {
  describeAlbumManageDeleteLabel,
  describeAlbumManageRemoveLabel,
  describeCancelLabel,
  describeDeleteLabel,
  describeRemoveLabel,
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
})
