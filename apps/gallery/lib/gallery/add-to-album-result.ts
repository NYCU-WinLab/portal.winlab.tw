export type AddToAlbumToast = {
  kind: "message" | "success"
  title: string
}

/** Toast copy after adding selected photos to an existing album. */
export function describeAddToAlbumResult(input: {
  added: number
  selected: number
  albumTitle: string
}): AddToAlbumToast {
  const { added, selected, albumTitle } = input
  if (added <= 0) {
    return {
      kind: "message",
      title: "Already in that album (or nothing new to add).",
    }
  }
  if (added < selected) {
    return {
      kind: "success",
      title: `Added ${added} of ${selected} to ${albumTitle} (duplicates skipped or album near the 200 cap)`,
    }
  }
  return {
    kind: "success",
    title: `Added ${added} to ${albumTitle}`,
  }
}

/** Toast title after creating an album and adding the selection. */
export function describeCreateAlbumStarted(input: {
  title: string
  added: number
}): string {
  const { title, added } = input
  if (added === 1) return `Started ${title} with 1 photo`
  if (added > 1) return `Started ${title} with ${added} photos`
  return `Started ${title}`
}

/** Trigger label for the add-to-album control. */
export function describeAddToAlbumTriggerLabel(count: number): string {
  return count > 1 ? `Add ${count} to album` : "Add to album"
}

/** Dialog title for the add-to-album picker. */
export function describeAddToAlbumDialogTitle(count: number): string {
  return count > 1 ? `Add ${count} photos to album` : "Add to album"
}

/** Dialog description for the add-to-album picker. */
export function describeAddToAlbumDialogDescription(count: number): string {
  return count > 1
    ? "Curate the selected wall covers into one of your collections."
    : "Curate this shot into one of your collections. Share links live at /albums/<slug>."
}

/**
 * Error when create succeeded but add failed, and deleting the empty album
 * also failed — warn that an empty shell may remain.
 */
export function describeAlbumCreateRollbackError(input: {
  title: string
  addError: string
}): string {
  return `${input.addError} Album “${input.title}” may still exist empty — delete it from Albums.`
}

/** aria-label for creating an album and adding the current selection. */
export function describeCreateAlbumAndAddPhotosAriaLabel(): string {
  return "Create album and add photos"
}

/** Placeholder for the inline new-album title field. */
export function describeNewAlbumTitlePlaceholder(): string {
  return "New album title"
}
