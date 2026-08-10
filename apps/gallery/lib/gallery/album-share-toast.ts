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
