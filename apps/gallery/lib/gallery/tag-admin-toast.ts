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
