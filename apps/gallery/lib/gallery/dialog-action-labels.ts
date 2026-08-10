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
