/** Toast after saving or removing a photo from favorites. */
export function describeFavoriteToast(favorited: boolean): string {
  return favorited ? "Saved to favorites" : "Removed from favorites"
}

/** aria-label for the favorite toggle control. */
export function describeFavoriteAriaLabel(favorited: boolean): string {
  return favorited ? "Remove from favorites" : "Save to favorites"
}
