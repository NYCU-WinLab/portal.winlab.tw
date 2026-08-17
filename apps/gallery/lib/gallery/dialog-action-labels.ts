/** Shared Cancel label for alert dialogs and secondary actions. */
export function describeCancelLabel(): string {
  return "Cancel"
}

/** Idle Delete label. */
export function describeDeleteLabel(): string {
  return "Delete"
}

/** Resolve Delete / Deleting? for album manage destructive confirm. */
export function describeAlbumManageDeleteLabel(pending: boolean): string {
  return pending ? "Deleting?" : describeDeleteLabel()
}

/** Idle Remove label. */
export function describeRemoveLabel(): string {
  return "Remove"
}

/** Resolve Remove / Removing? for album manage destructive confirm. */
export function describeAlbumManageRemoveLabel(pending: boolean): string {
  return pending ? "Removing?" : describeRemoveLabel()
}

/** Idle Retry label. */
export function describeRetryLabel(): string {
  return "Retry"
}

/** Idle Save label. */
export function describeSaveLabel(): string {
  return "Save"
}

/** Bulk Save N label (falls back to Save when count is 0). */
export function describeSaveCountLabel(count: number): string {
  return count > 0 ? `Save ${count}` : describeSaveLabel()
}

/** Idle Tag submit label. */
export function describeTagLabel(): string {
  return "Tag"
}

/** Idle Create submit label. */
export function describeCreateLabel(): string {
  return "Create"
}

/** Copy link action on album pickers. */
export function describeCopyLinkLabel(): string {
  return "Copy link"
}
