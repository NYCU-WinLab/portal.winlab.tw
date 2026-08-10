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
