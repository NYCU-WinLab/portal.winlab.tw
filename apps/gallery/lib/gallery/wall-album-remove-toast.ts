/** Toast after removing selected wall covers from the filtered album. */
export function describeWallAlbumPhotosRemoved(removed: number): string {
  if (removed === 1) return "Removed 1 photo from this album."
  return `Removed ${removed} photos from this album.`
}
