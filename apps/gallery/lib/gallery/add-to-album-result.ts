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
