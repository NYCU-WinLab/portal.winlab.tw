/** Shared auth gate error for gallery server actions. */
export function describePleaseSignInFirst(): string {
  return "Please sign in first."
}

/** Bulk action when the selection set is empty. */
export function describeNothingSelectedError(): string {
  return "Nothing selected."
}

/** Bulk manage when zero works are selected. */
export function describeSelectAtLeastOneWorkError(): string {
  return "Select at least one work."
}

/** Wall infinite-scroll fallback when the page load throws. */
export function describeFailedToLoadMorePhotos(): string {
  return "Failed to load more photos."
}

/** Tag name failed normalize / empty. */
export function describeTagNameInvalidError(): string {
  return "Tag name is empty or invalid."
}

/** Tags RPCs / tables not migrated yet. */
export function describeTagsUnavailableError(): string {
  return "Tags are not available yet."
}

/** Tag admin RPCs not migrated yet. */
export function describeTagAdminUnavailableError(): string {
  return "Tag admin is not available yet."
}

/** Attach/create path could not link the tag. */
export function describeCouldNotAttachTagError(): string {
  return "Could not attach that tag."
}

/** Lookup miss for a tag id/slug. */
export function describeTagNotFoundError(): string {
  return "Tag not found."
}

export function describeMissingImageOrTagIdError(): string {
  return "Missing image or tag id."
}

export function describeMissingTagError(): string {
  return "Missing tag."
}

export function describeMissingTagIdError(): string {
  return "Missing tag id."
}

export function describeMissingImageError(): string {
  return "Missing image."
}

export function describeOnlyAdminsCanRenameTagsError(): string {
  return "Only admins can rename tags."
}

export function describeOnlyAdminsCanMergeTagsError(): string {
  return "Only admins can merge tags."
}

export function describeTagRenameFailedError(): string {
  return "Rename failed."
}

export function describeTagMergeFailedError(): string {
  return "Merge failed."
}

export function describeMissingSourceOrTargetTagError(): string {
  return "Missing source or target tag."
}

export function describePickDifferentTagsToMergeError(): string {
  return "Pick two different tags to merge."
}

export function describeSelectAtMost100WorksError(): string {
  return "Select at most 100 works at a time."
}

/** Favorites RPCs / tables not migrated yet. */
export function describeFavoritesUnavailableError(): string {
  return "Favorites are not available yet — apply the gallery favorites migration."
}

export function describeAlbumsUnavailableError(): string {
  return "Albums are not available yet."
}

export function describeAlbumActionFailedError(): string {
  return "Album action failed."
}

export function describeAlbumTitleInvalidError(): string {
  return "Album title is empty or invalid."
}

export function describeAlbumNotFoundError(): string {
  return "Album not found."
}

export function describePinFailedForPhotoError(): string {
  return "Pin failed for that photo."
}

export function describeMissingImageIdError(): string {
  return "Missing image id."
}

export function describePinUnavailableError(): string {
  return "Pin is not available yet — apply the gallery image pin migration."
}

export function describePinFailedError(detail?: string | null): string {
  return detail ? `Pin failed: ${detail}` : "Pin failed."
}

export function describeStorageDeleteLeftoverWarning(): string {
  return "Removed from the wall, but a storage file may still remain. Retry delete or purge via Media health."
}

export function describeStorageDeleteLeftoversWarning(): string {
  return "Removed from the wall, but some storage files may still remain."
}
