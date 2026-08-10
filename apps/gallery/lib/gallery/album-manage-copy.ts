/** Toast title after removing one or more photos from an album. */
export function describeAlbumPhotosRemoved(removed: number): string {
  if (removed === 1) return "Removed 1 photo from album"
  return `Removed ${removed} photos from album`
}
