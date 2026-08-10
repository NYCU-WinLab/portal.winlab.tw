import { describe, expect, test } from "bun:test"

import {
  describeAlbumTitlePlaceholder,
  describeMoreSelectionActionsAriaLabel,
  describeNewAlbumTitleAriaLabel,
  describeTagDraftPlaceholder,
  describeTagToApplyAriaLabel,
} from "@/lib/gallery/wall-select-labels"

describe("wall select labels", () => {
  test("overflow and bulk-curate aria-labels", () => {
    expect(describeMoreSelectionActionsAriaLabel()).toBe(
      "More selection actions"
    )
    expect(describeTagToApplyAriaLabel()).toBe("Tag to apply to selection")
    expect(describeNewAlbumTitleAriaLabel()).toBe("New album title")
  })

  test("bulk-curate placeholders", () => {
    expect(describeTagDraftPlaceholder()).toBe("Tag…")
    expect(describeAlbumTitlePlaceholder()).toBe("Album title…")
  })
})
