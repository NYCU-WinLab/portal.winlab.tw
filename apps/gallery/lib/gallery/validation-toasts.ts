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

/** Placeholder when the comment box is locked for guests. */
export function describeSignInToCommentLabel(): string {
  return "Sign in to comment"
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

/** Upload picker: no usable media after mime/size filter. */
export function describePickUploadMedia(videoAvailable: boolean): string {
  return videoAvailable ? "Pick a photo or clip." : "Pick a photo."
}

/** Lightbox download when the active shot has no path. */
export function describeNothingToDownload(): string {
  return "Nothing to download."
}

/** Selection gate before album/add actions. */
export function describeSelectAtLeastOnePhoto(): string {
  return "Select at least one photo."
}

/** Media-health delete gate. */
export function describeSelectAtLeastOneBrokenShot(): string {
  return "Select at least one broken shot."
}

/** Capture-date editor empty draft. */
export function describeCaptureDateRequired(): string {
  return "Pick a capture date."
}

/** Manage bulk tag empty draft. */
export function describeEnterATag(): string {
  return "Enter a tag."
}

/** Manage bulk untag empty slug. */
export function describeEnterATagSlugToRemove(): string {
  return "Enter a tag slug to remove."
}

/** Memories teaser with nothing to play. */
export function describeNoMemoriesToPlay(): string {
  return "No memories to play right now."
}

/** Sign-out failure. */
export function describeCouldNotSignOut(): string {
  return "Could not sign out."
}

/** Sign-in OAuth start failure. */
export function describeCouldNotStartSignIn(): string {
  return "Could not start sign-in."
}

/** Home filters invalid tag slug. */
export function describeInvalidTagSlug(): string {
  return "Use letters, numbers, or hyphens for a tag slug."
}

/** Cap reached when attaching tags on a photo. */
export function describeTagLimitReached(max: number): string {
  return `At most ${max} tags per photo.`
}
