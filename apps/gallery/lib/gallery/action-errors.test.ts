import { describe, expect, test } from "bun:test"

import {
  describeCouldNotAttachTagError,
  describeFailedToLoadMorePhotos,
  describeMissingImageError,
  describeMissingImageOrTagIdError,
  describeMissingSourceOrTargetTagError,
  describeMissingTagError,
  describeMissingTagIdError,
  describeNothingSelectedError,
  describeOnlyAdminsCanMergeTagsError,
  describeOnlyAdminsCanRenameTagsError,
  describePickDifferentTagsToMergeError,
  describePleaseSignInFirst,
  describeSelectAtLeastOneWorkError,
  describeSelectAtMost100WorksError,
  describeTagAdminUnavailableError,
  describeTagMergeFailedError,
  describeTagNameInvalidError,
  describeTagNotFoundError,
  describeTagRenameFailedError,
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
    expect(describeMissingImageOrTagIdError()).toBe("Missing image or tag id.")
    expect(describeMissingTagError()).toBe("Missing tag.")
    expect(describeMissingTagIdError()).toBe("Missing tag id.")
    expect(describeMissingImageError()).toBe("Missing image.")
    expect(describeOnlyAdminsCanRenameTagsError()).toBe(
      "Only admins can rename tags."
    )
    expect(describeOnlyAdminsCanMergeTagsError()).toBe(
      "Only admins can merge tags."
    )
    expect(describeTagRenameFailedError()).toBe("Rename failed.")
    expect(describeTagMergeFailedError()).toBe("Merge failed.")
    expect(describeMissingSourceOrTargetTagError()).toBe(
      "Missing source or target tag."
    )
    expect(describePickDifferentTagsToMergeError()).toBe(
      "Pick two different tags to merge."
    )
    expect(describeSelectAtMost100WorksError()).toBe(
      "Select at most 100 works at a time."
    )
  })
})
