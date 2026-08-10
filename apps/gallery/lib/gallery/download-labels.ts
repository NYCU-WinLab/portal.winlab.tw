/** Toast while Manage densifies sequence indexes after a reorder. */
export function describeSequenceCompactingToast(): string {
  return "Compacting sequence slots…"
}

/** Default label for the album ZIP download control. */
export function describeDownloadAlbumLabel(photoCount: number): string {
  return photoCount > 0 ? `Download album (${photoCount})` : "Download album"
}

/** Default label for the story/sequence ZIP download control. */
export function describeDownloadStoryLabel(shotCount: number): string {
  return shotCount > 1 ? `Download story (${shotCount})` : "Download story"
}

/** Soft-fail toast when favorite requires auth. */
export function describeSignInToFavorite(): string {
  return "Sign in to save favorites."
}
