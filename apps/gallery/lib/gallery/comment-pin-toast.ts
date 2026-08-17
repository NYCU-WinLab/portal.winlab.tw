/** Toast after pinning or unpinning a gallery comment. */
export function describeCommentPinToast(pinned: boolean): string {
  return pinned ? "Comment pinned." : "Comment unpinned."
}
