/** Validation toast when an album title has no usable characters. */
export function describeAlbumTitleRequired(): string {
  return "Give the album a name with letters or numbers."
}

/** Soft-fail when Web Share / clipboard cannot copy multiple links. */
export function describeCouldNotCopyLinks(): string {
  return "Could not copy links in this context."
}

/** Soft-fail when clipboard write fails for a selection. */
export function describeCouldNotCopyClipboard(): string {
  return "Could not copy to the clipboard."
}

/** Auth gate before posting a comment. */
export function describeSignInBeforeComment(): string {
  return "Please sign in before commenting."
}

/** Auth gate before reacting. */
export function describeSignInBeforeReact(): string {
  return "Please sign in before reacting."
}

/** Tag admin: rename draft empty after normalize. */
export function describeTagNameRequired(): string {
  return "Give the tag a usable name."
}

/** Tag admin: merge without a target. */
export function describeTagMergeTargetRequired(): string {
  return "Pick a target tag to merge into."
}

/** Upload form: no files selected. */
export function describeUploadFileRequired(): string {
  return "Pick a file."
}

/** Upload form: empty File blobs. */
export function describeUploadFileEmpty(): string {
  return "One of the selected files is empty."
}

/** Lightbox download when the active shot has no path. */
export function describeNothingToDownload(): string {
  return "Nothing to download."
}
