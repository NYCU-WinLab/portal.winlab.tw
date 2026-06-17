"use client"

import { useMemo, useRef, useState, useTransition } from "react"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { addGalleryComment, deleteGalleryComment } from "@/app/actions"
import { parseMentions } from "@/lib/gallery/mentions"
import type { GalleryComment, GalleryMember } from "@/lib/gallery/types"

type CommentNode = GalleryComment & { depth: number }

export function GalleryComments({
  imageId,
  initialComments,
  isSignedIn,
  viewerId,
  viewerName,
  members,
}: {
  imageId: string
  initialComments: GalleryComment[]
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
}) {
  const [comments, setComments] = useState(initialComments)
  const [draft, setDraft] = useState("")
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const flattened = useMemo(() => flattenComments(comments), [comments])

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => (m.name ?? "").toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members])

  const handleDraftChange = (value: string) => {
    setDraft(value)
    const cursor = textareaRef.current?.selectionStart ?? value.length
    const before = value.slice(0, cursor)
    const match = before.match(/@([\p{L}\p{N}._-]*)$/u)
    setMentionQuery(match?.[1] ?? null)
  }

  const applyMention = (member: GalleryMember) => {
    const name = member.name
    if (!name) return
    const cursor = textareaRef.current?.selectionStart ?? draft.length
    const before = draft.slice(0, cursor).replace(/@[\p{L}\p{N}._-]*$/u, "")
    const after = draft.slice(cursor)
    const next = `${before}@${name} ${after}`
    setDraft(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      const pos = before.length + name.length + 2
      textareaRef.current?.setSelectionRange(pos, pos)
    })
  }

  const submit = () => {
    if (!isSignedIn) {
      toast.error("Please sign in before commenting.")
      return
    }
    const body = draft.trim()
    if (!body) return

    startTransition(async () => {
      const result = await addGalleryComment(imageId, body, replyTarget)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setComments((prev) => [
        ...prev,
        {
          ...result.data,
          commenter_name: viewerName,
        },
      ])
      setDraft("")
      setReplyTarget(null)
      setMentionQuery(null)
      toast.success("Comment posted.")
    })
  }

  const removeComment = (commentId: string) => {
    startTransition(async () => {
      const result = await deleteGalleryComment(commentId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setComments((prev) => removeCommentWithDescendants(prev, commentId))
      toast.success("Comment deleted.")
    })
  }

  const showMentionPicker = mentionQuery !== null && filteredMembers.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col not-italic">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {flattened.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          <ul className="space-y-2">
            {flattened.map((comment) => {
              const mine = viewerId === comment.created_by
              return (
                <li
                  key={comment.id}
                  className={cn(
                    "space-y-1 rounded-md border border-border/60 px-3 py-2",
                    comment.depth > 0 && "ml-5"
                  )}
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.commenter_name}
                    </span>
                    <span>·</span>
                    <span>{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                    <FormattedComment
                      content={comment.body}
                      members={members}
                    />
                  </p>
                  <div className="flex items-center gap-3">
                    {isSignedIn ? (
                      <button
                        type="button"
                        onClick={() => setReplyTarget(comment.id)}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Reply
                      </button>
                    ) : null}
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => removeComment(comment.id)}
                        className="text-xs text-destructive/90 transition-colors hover:text-destructive"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="relative shrink-0 space-y-2 border-t border-border/60 pt-3">
        {showMentionPicker ? (
          <div className="absolute right-0 bottom-full left-0 z-50 mb-1 flex max-h-48 flex-col overflow-y-auto rounded-xl border border-border bg-popover shadow-md">
            {filteredMembers.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => applyMention(m)}
                className="flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <Avatar className="size-5">
                  <AvatarFallback className="text-[10px]">
                    {(m.name ?? "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{m.name ?? m.email}</span>
              </button>
            ))}
          </div>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => handleDraftChange(e.target.value)}
          placeholder={
            isSignedIn
              ? "Write a comment… type @ to mention someone"
              : "Sign in to leave a comment"
          }
          disabled={!isSignedIn || isPending}
          className="min-h-20 resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          {replyTarget ? (
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Replying to a comment · cancel
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {comments.length} comment{comments.length === 1 ? "" : "s"}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!isSignedIn || isPending || !draft.trim()}
            onClick={submit}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  )
}

function FormattedComment({
  content,
  members,
}: {
  content: string
  members: GalleryMember[]
}) {
  const mentionNames = new Set(parseMentions(content))
  const knownNames = new Set(
    members.map((m) => m.name).filter((n): n is string => Boolean(n))
  )

  if (mentionNames.size === 0) return <>{content}</>

  const parts = content.split(/(@[\p{L}\p{N}._-]+)/gu)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const name = part.slice(1)
          if (mentionNames.has(name) && knownNames.has(name)) {
            return (
              <span
                key={i}
                className="rounded bg-blue-500/15 px-1 py-0.5 text-blue-700 dark:text-blue-300"
              >
                {part}
              </span>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function flattenComments(comments: GalleryComment[]): CommentNode[] {
  const byParent = new Map<string | null, GalleryComment[]>()
  for (const comment of comments) {
    const bucket = byParent.get(comment.parent_id) ?? []
    bucket.push(comment)
    byParent.set(comment.parent_id, bucket)
  }
  for (const bucket of byParent.values()) {
    bucket.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
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

function removeCommentWithDescendants(
  comments: GalleryComment[],
  targetId: string
): GalleryComment[] {
  const childrenByParent = new Map<string, string[]>()
  for (const c of comments) {
    if (!c.parent_id) continue
    const bucket = childrenByParent.get(c.parent_id) ?? []
    bucket.push(c.id)
    childrenByParent.set(c.parent_id, bucket)
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

  return comments.filter((c) => !toDelete.has(c.id))
}
