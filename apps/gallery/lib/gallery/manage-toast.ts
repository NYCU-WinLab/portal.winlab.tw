/** Toast after renaming an artwork in Manage. */
export function describeArtworkNameUpdated(): string {
  return "Name updated"
}

/** Toast after renaming from the lightbox / polaroid title editor. */
export function describeArtworkTitleUpdated(): string {
  return "Title updated"
}

/** aria-label for opening the title editor. */
export function describeEditTitleAriaLabel(): string {
  return "Edit title"
}

/** aria-label when the title editor shows the current name. */
export function describeEditTitleNamedAriaLabel(name: string): string {
  return `Edit title: ${name}`
}

/** Toast after editing capture date (taken_at). */
export function describeCaptureDateUpdated(): string {
  return "Capture date updated"
}

/** Toast after reordering a Manage sequence. */
export function describeSequenceUpdated(): string {
  return "Sequence updated."
}
