import { describe, expect, test } from "bun:test"

import {
  describeAlbumTriggerLabel,
  describeEditCaptureDateAriaLabel,
  describeEditLabel,
  describePinnedBadgeLabel,
  describePlayLabel,
  describeRemoveSelectionFromAlbumDescription,
  describeUnsaveLabel,
  describeUnsaveSelectionDescription,
  describeUntagLabel,
  describeUntagSelectionDescription,
} from "@/lib/gallery/selection-action-labels"

describe("selection action labels", () => {
  test("dialog descriptions", () => {
    expect(describeUnsaveSelectionDescription()).toContain("Saved list")
    expect(describeRemoveSelectionFromAlbumDescription()).toContain(
      "this album only"
    )
    expect(describeUntagSelectionDescription()).toContain("tag filter")
  })

  test("action and chrome labels", () => {
    expect(describeUntagLabel()).toBe("Untag")
    expect(describeUnsaveLabel()).toBe("Unsave")
    expect(describePlayLabel()).toBe("Play")
    expect(describeAlbumTriggerLabel()).toBe("Album")
    expect(describeAlbumTriggerLabel(4)).toBe("Album (4)")
    expect(describePinnedBadgeLabel()).toBe("Pinned")
    expect(describeEditLabel()).toBe("Edit")
    expect(describeEditCaptureDateAriaLabel()).toBe(
      "Edit capture date for this work"
    )
    expect(describeEditCaptureDateAriaLabel("Sunset")).toBe(
      "Edit capture date for Sunset"
    )
  })
})
