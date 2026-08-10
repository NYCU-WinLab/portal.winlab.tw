/** Empty-state title when the home wall has no photos. */
export function describeNothingOnWallYetTitle(): string {
  return "Nothing on the wall yet"
}

/** Empty-state title when album tables/RPCs are not migrated yet. */
export function describeAlbumsNotReadyTitle(): string {
  return "Albums not ready yet"
}

/** Empty-state title for an album with zero photos. */
export function describeAlbumStillEmptyTitle(): string {
  return "Still empty"
}

/** Empty-state title for the albums index list. */
export function describeAlbumsEmptyTitle(input: {
  query: boolean
  mineOnly: boolean
}): string {
  if (input.query) return "No albums match that search"
  if (input.mineOnly) return "You have no albums yet"
  return "No albums yet"
}

/** Memories empty-state when the memories migration is missing. */
export function describeMemoriesNotReadyTitle(): string {
  return "Not ready yet"
}

/** Memories empty-state when no prior-year shots match the day. */
export function describeMemoriesEmptyTrayTitle(): string {
  return "Empty tray"
}

/** Common link label back to the home wall. */
export function describeBackToTheWallLabel(): string {
  return "Back to the wall"
}
