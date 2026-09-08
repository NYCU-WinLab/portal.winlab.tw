/** Apply exclusive pin/unpin to top-level comments on one image. */
export function applyExclusiveCommentPin<
  T extends {
    id: string
    image_id: string
    parent_id: string | null
    pinned_at: string | null
  },
>(
  comments: T[],
  comment: Pick<T, "id" | "image_id">,
  nextPinned: boolean,
  pinnedAt: string | null
): T[] {
  return comments.map((row) => {
    if (row.image_id !== comment.image_id || row.parent_id) return row
    if (row.id === comment.id) {
      return { ...row, pinned_at: pinnedAt }
    }
    if (nextPinned) {
      return { ...row, pinned_at: null }
    }
    return row
  })
}
