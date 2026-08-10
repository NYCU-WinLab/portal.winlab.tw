/** Toast after copying an album share link to the clipboard. */
export function describeAlbumShareCopied(): string {
  return "Share link copied"
}

/** Toast after creating an album (optionally with link already copied). */
export function describeAlbumCreateReady(input: {
  title: string
  linkCopied: boolean
}): string {
  const { title, linkCopied } = input
  if (linkCopied) {
    return `Album “${title}” ready — link copied`
  }
  return `Album “${title}” is ready`
}

/** Default share button label (viewer / soft share). */
export function describeShareAlbumLabel(): string {
  return "Share album"
}

/** Emphasized share button label for owners copying the link. */
export function describeCopyShareLinkLabel(): string {
  return "Copy share link"
}

/** Resolve the share button label from emphasize + optional override. */
export function describeShareAlbumButtonLabel(input: {
  emphasize?: boolean
  label?: string
}): string {
  if (input.label) return input.label
  return input.emphasize
    ? describeCopyShareLinkLabel()
    : describeShareAlbumLabel()
}
