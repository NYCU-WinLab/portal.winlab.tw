import { describe, expect, test } from "bun:test"

import {
  describeCouldNotAttachTagError,
  describeFailedToLoadMorePhotos,
  describeNothingSelectedError,
  describePleaseSignInFirst,
  describeSelectAtLeastOneWorkError,
  describeTagAdminUnavailableError,
  describeTagNameInvalidError,
  describeTagNotFoundError,
  describeTagsUnavailableError,
} from "@/lib/gallery/action-errors"

describe("action errors", () => {
  test("auth and selection", () => {
    expect(describePleaseSignInFirst()).toBe("Please sign in first.")
    expect(describeNothingSelectedError()).toBe("Nothing selected.")
    expect(describeSelectAtLeastOneWorkError()).toBe(
      "Select at least one work."
    )
    expect(describeFailedToLoadMorePhotos()).toBe("Failed to load more photos.")
  })

  test("tag errors", () => {
    expect(describeTagNameInvalidError()).toBe("Tag name is empty or invalid.")
    expect(describeTagsUnavailableError()).toBe("Tags are not available yet.")
    expect(describeTagAdminUnavailableError()).toBe(
      "Tag admin is not available yet."
    )
    expect(describeCouldNotAttachTagError()).toBe("Could not attach that tag.")
    expect(describeTagNotFoundError()).toBe("Tag not found.")
  })
})
