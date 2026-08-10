/** Toast title after creating an album from a multi-photo selection. */
export function describeAlbumFromSelection(input: {
  title: string
  added: number
}): string {
  const { title, added } = input
  if (added > 0) {
    return `Album “${title}” with ${added} photo${added === 1 ? "" : "s"}`
  }
  return `Album “${title}” created`
}
