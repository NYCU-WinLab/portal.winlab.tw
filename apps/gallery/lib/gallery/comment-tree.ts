/** Remove a comment and every descendant reply (BFS over parent_id). */
export function removeCommentWithDescendants<
  T extends { id: string; parent_id: string | null },
>(comments: T[], targetId: string): T[] {
  const childrenByParent = new Map<string, string[]>()
  for (const comment of comments) {
    if (!comment.parent_id) continue
    const bucket = childrenByParent.get(comment.parent_id) ?? []
    bucket.push(comment.id)
    childrenByParent.set(comment.parent_id, bucket)
  }

  const toDelete = new Set<string>()
  const queue = [targetId]
  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || toDelete.has(current)) continue
    toDelete.add(current)
    const children = childrenByParent.get(current) ?? []
    for (const childId of children) queue.push(childId)
  }

  return comments.filter((comment) => !toDelete.has(comment.id))
}
