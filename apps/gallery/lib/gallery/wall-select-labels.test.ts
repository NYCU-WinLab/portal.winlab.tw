import { describe, expect, test } from "bun:test"

import {
  describeAlbumTitlePlaceholder,
  describeBulkTagExamplesPlaceholder,
  describeMoreSelectionActionsAriaLabel,
  describeNewAlbumTitleAriaLabel,
  describeSignInToCurateLabel,
  describeTagDraftPlaceholder,
  describeTagSlugPlaceholder,
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
    expect(describeBulkTagExamplesPlaceholder()).toBe("retreat, axolotl…")
    expect(describeTagSlugPlaceholder()).toBe("slug…")
  })

  test("signed-out curate label", () => {
    expect(describeSignInToCurateLabel()).toBe("Sign in to curate")
  })
})
