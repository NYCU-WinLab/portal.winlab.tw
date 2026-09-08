/** Dialog description when unsaving a wall selection. */
export function describeUnsaveSelectionDescription(): string {
  return "Removes the selection from your Saved list. Photos stay on the wall."
}

/** Dialog description when removing a wall selection from the current album. */
export function describeRemoveSelectionFromAlbumDescription(): string {
  return "Removes the selection from this album only. Photos stay on the wall."
}

/** Dialog description when detaching the active tag filter. */
export function describeUntagSelectionDescription(): string {
  return "Detaches the active tag filter from the selection. Photos stay on the wall."
}

/** Confirm action label for bulk untag. */
export function describeUntagLabel(): string {
  return "Untag"
}

/** Confirm action label for bulk unsave. */
export function describeUnsaveLabel(): string {
  return "Unsave"
}

/** Idle Play slideshow control label. */
export function describePlayLabel(): string {
  return "Play"
}

/** Short Album trigger when nothing is counted. */
export function describeAlbumTriggerLabel(count = 0): string {
  return count > 0 ? `Album (${count})` : "Album"
}

/** Visible Pinned badge on a comment. */
export function describePinnedBadgeLabel(): string {
  return "Pinned"
}

/** Idle Edit action label. */
export function describeEditLabel(): string {
  return "Edit"
}

/** aria-label for editing a work's capture date. */
export function describeEditCaptureDateAriaLabel(imageName?: string): string {
  return imageName
    ? `Edit capture date for ${imageName}`
    : "Edit capture date for this work"
}
