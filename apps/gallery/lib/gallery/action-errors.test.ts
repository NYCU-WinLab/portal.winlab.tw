import { describe, expect, test } from "bun:test"

import {
  describeAlbumsUnavailableError,
  describeAlbumActionFailedError,
  describeAlbumNotFoundError,
  describeAlbumTitleInvalidError,
  describeCouldNotAttachTagError,
  describeFailedToLoadMorePhotos,
  describeFavoritesUnavailableError,
  describeMissingImageError,
  describeMissingImageIdError,
  describeMissingImageOrTagIdError,
  describeMissingSourceOrTargetTagError,
  describeMissingTagError,
  describeMissingTagIdError,
  describeNothingSelectedError,
  describeOnlyAdminsCanMergeTagsError,
  describeOnlyAdminsCanRenameTagsError,
  describePickDifferentTagsToMergeError,
  describePinFailedError,
  describePinFailedForPhotoError,
  describePinUnavailableError,
  describePleaseSignInFirst,
  describeSelectAtLeastOneWorkError,
  describeSelectAtMost100WorksError,
  describeStorageDeleteLeftoverWarning,
  describeStorageDeleteLeftoversWarning,
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
    expect(describeFavoritesUnavailableError()).toBe(
      "Favorites are not available yet — apply the gallery favorites migration."
    )
    expect(describeAlbumsUnavailableError()).toBe(
      "Albums are not available yet."
    )
    expect(describeAlbumActionFailedError()).toBe("Album action failed.")
    expect(describeAlbumTitleInvalidError()).toBe(
      "Album title is empty or invalid."
    )
    expect(describeAlbumNotFoundError()).toBe("Album not found.")
    expect(describePinFailedForPhotoError()).toBe("Pin failed for that photo.")
    expect(describeMissingImageIdError()).toBe("Missing image id.")
    expect(describePinUnavailableError()).toContain("pin migration")
    expect(describePinFailedError()).toBe("Pin failed.")
    expect(describePinFailedError("boom")).toBe("Pin failed: boom")
    expect(describeStorageDeleteLeftoverWarning()).toContain("Media health")
    expect(describeStorageDeleteLeftoversWarning()).toContain(
      "some storage files"
    )
  })
})
