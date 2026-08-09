/** Human toast copy after applying one tag to many wall selections. */
export function describeBulkTagAttach(input: {
  tagName: string
  attached: number
  selected: number
}): string {
  const { tagName, attached, selected } = input
  if (attached === 0) {
    return `“${tagName}” was already on those photos (or they were at the tag limit).`
  }
  if (attached === selected) {
    return `Tagged ${attached} photo${attached === 1 ? "" : "s"} with “${tagName}”.`
  }
  return `Tagged ${attached} of ${selected} photos with “${tagName}”.`
}

/** Human toast copy after removing one tag from many selections. */
export function describeBulkTagDetach(input: {
  tagName: string
  detached: number
}): string {
  const { tagName, detached } = input
  if (detached === 0) {
    return `None of those photos had “${tagName}”.`
  }
  return `Removed “${tagName}” from ${detached} photo${detached === 1 ? "" : "s"}.`
}
