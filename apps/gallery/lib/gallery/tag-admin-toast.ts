/** Toast after renaming a tag in the admin catalog. */
export function describeTagRenamed(name: string): string {
  return `Renamed to "${name}"`
}

/** Toast after merging one tag into another. */
export function describeTagMerged(input: {
  name: string
  movedCount: number
}): string {
  const { name, movedCount } = input
  const links = movedCount === 1 ? "link" : "links"
  return `Merged into "${name}" (${movedCount} ${links} moved)`
}

/** Inline status when the manage tags dialog fails to load. */
export function describeCouldNotLoadTags(error: string): string {
  return `Could not load tags — ${error}`
}

/** Visible label for the manage-tags dialog trigger. */
export function describeTagsButtonLabel(): string {
  return "Tags"
}

/** aria-label for editing tags on a named artwork. */
export function describeEditTagsAriaLabel(imageName: string): string {
  return `Edit tags for ${imageName}`
}

/** aria-label for submitting a new tag on a photo. */
export function describeAddTagAriaLabel(): string {
  return "Add tag"
}

/** Placeholder for the add-tag input on a photo. */
export function describeAddTagPlaceholder(): string {
  return "Add a tag…"
}
