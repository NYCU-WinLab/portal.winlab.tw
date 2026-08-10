/** Toast after saving or removing a photo from favorites. */
export function describeFavoriteToast(favorited: boolean): string {
  return favorited ? "Saved to favorites" : "Removed from favorites"
}
