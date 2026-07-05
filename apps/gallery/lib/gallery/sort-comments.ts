import type { GalleryComment } from "@/lib/gallery/types"

export type CommentNode = GalleryComment & { depth: number }

export function flattenGalleryComments(
  comments: GalleryComment[]
): CommentNode[] {
  const byParent = new Map<string | null, GalleryComment[]>()
  for (const comment of comments) {
    const bucket = byParent.get(comment.parent_id) ?? []
    bucket.push(comment)
    byParent.set(comment.parent_id, bucket)
  }

  for (const bucket of byParent.values()) {
    bucket.sort(compareSiblingComments)
  }

  const out: CommentNode[] = []
  const walk = (parentId: string | null, depth: number) => {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      out.push({ ...child, depth })
      walk(child.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

function compareSiblingComments(a: GalleryComment, b: GalleryComment): number {
  const aPinned = a.pinned_at ? 1 : 0
  const bPinned = b.pinned_at ? 1 : 0
  if (aPinned !== bPinned) return bPinned - aPinned
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}
