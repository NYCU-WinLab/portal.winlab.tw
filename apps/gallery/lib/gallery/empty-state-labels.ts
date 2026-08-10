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

/** Empty-state description when the home wall has no photos. */
export function describeNothingOnWallYetDescription(): string {
  return "Hang the first polaroid — the lab wall is waiting."
}

/** CTA when signed in on an empty wall. */
export function describeUploadAPhotoLabel(): string {
  return "Upload a photo"
}

/** CTA when signed out on an empty wall. */
export function describeSignInToUploadLabel(): string {
  return "Sign in to upload"
}

/** Albums index not-ready description. */
export function describeAlbumsNotReadyDescription(): string {
  return "Apply the gallery albums migration, then refresh — Manage already soft-hides album tools until then."
}

/** Album detail not-ready description. */
export function describeAlbumPageNotReadyDescription(): string {
  return "Apply the gallery albums migration, then refresh this page."
}

/** Album detail empty description. */
export function describeAlbumStillEmptyDescription(canManage: boolean): string {
  return canManage
    ? "Open any photo on the wall and choose Add to album."
    : "The curator has not hung any photos here yet."
}

/** Empty album CTA. */
export function describeBrowseTheWallLabel(): string {
  return "Browse the wall"
}

/** Albums list empty descriptions. */
export function describeAlbumsEmptyDescription(input: {
  query: boolean
  mineOnly: boolean
  signedIn: boolean
}): string {
  if (input.query) {
    return "Try another title, slug, owner, or clear the search."
  }
  if (input.mineOnly) {
    return "Create one above, or clear the filter to browse everyone else’s collections."
  }
  if (input.signedIn) {
    return "Name a collection above, then add photos from any lightbox on the wall."
  }
  return "When lab members curate collections, they will show up here."
}

export function describeClearSearchLabel(): string {
  return "Clear search"
}

export function describeNoSavedPhotosTitle(): string {
  return "No saved photos yet"
}

export function describeNoSavedPhotosDescription(): string {
  return "Tap the bookmark on a polaroid to keep it here."
}

export function describeShowAllAlbumsLabel(): string {
  return "Show all albums"
}

/** Memories not-ready description. */
export function describeMemoriesNotReadyDescription(): string {
  return "Memories needs the gallery memories migration (capture dates + on-this-day RPC). Apply it, then refresh — Manage already soft-hides capture-date tools until then."
}

/** Memories empty tray description for a calendar day label. */
export function describeMemoriesEmptyTrayDescription(dayLabel: string): string {
  return `Nothing from a past ${dayLabel} yet. Shots need a capture date (EXIF or upload day) to land here. Hang a polaroid today, and next year it will show up.`
}

/** Default seasonal theme option label. */
export function describePaperWallThemeLabel(): string {
  return "Paper wall"
}
