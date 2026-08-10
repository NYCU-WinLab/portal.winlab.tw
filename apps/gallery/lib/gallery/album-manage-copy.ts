/** Toast title after removing one or more photos from an album. */
export function describeAlbumPhotosRemoved(removed: number): string {
  if (removed === 1) return "Removed 1 photo from album"
  return `Removed ${removed} photos from album`
}

/** Toast after saving album title/description. */
export function describeAlbumUpdated(): string {
  return "Album updated"
}

/** Toast after removing the current lightbox photo from the album. */
export function describeAlbumPhotoRemoved(): string {
  return "Removed from album"
}

/** Toast after setting a new album cover. */
export function describeAlbumCoverUpdated(): string {
  return "Cover updated"
}

/** Toast after deleting an album. */
export function describeAlbumDeleted(): string {
  return "Album deleted"
}
