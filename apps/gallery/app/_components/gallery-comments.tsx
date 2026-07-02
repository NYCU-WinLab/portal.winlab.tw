"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"

import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { addGalleryComment, deleteGalleryComment } from "@/app/actions"
import { galleryPillClass, gallerySans } from "@/components/gallery-chrome"
import { FormattedCommentMentions } from "@/lib/gallery/format-comment-mentions"
import type { GalleryComment, GalleryMember } from "@/lib/gallery/types"

type CommentNode = GalleryComment & { depth: number }

export function GalleryComments({
  imageId,
  comments,
  onCommentsChange,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  highlightCommentId = null,
}: {
  imageId: string
  comments: GalleryComment[]
  onCommentsChange: (comments: GalleryComment[]) => void
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  highlightCommentId?: string | null
}) {
  const [draft, setDraft] = useState("")
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const flattened = useMemo(() => flattenComments(comments), [comments])

  useEffect(() => {
    if (!highlightCommentId) return
    const exists = flattened.some(
      (comment) => comment.id === highlightCommentId
    )
    if (!exists) return

    const frame = requestAnimationFrame(() => {
      const node = listRef.current?.querySelector<HTMLElement>(
        `[data-comment-id="${highlightCommentId}"]`
      )
      node?.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightedId(highlightCommentId)
    })

    const timer = window.setTimeout(() => setHighlightedId(null), 2400)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [flattened, highlightCommentId])

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members.filter((m) => (m.name ?? "").toLowerCase().includes(q))
  }, [mentionQuery, members])

  const mentionBrowseAll = mentionQuery === ""

  const handleDraftChange = (value: string) => {
    setDraft(value)
    syncMentionQuery(value, textareaRef.current?.selectionStart ?? value.length)
  }

  const syncMentionQuery = (value: string, cursor: number) => {
    const before = value.slice(0, cursor)
    const match = before.match(/@([\p{L}\p{N}._-]*)$/u)
    setMentionQuery(match ? (match[1] ?? "") : null)
  }

  const showMentionPicker = mentionQuery !== null
  const mentionPickerEmpty = showMentionPicker && filteredMembers.length === 0

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
      onCommentsChange([
        ...comments,
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
      onCommentsChange(removeCommentWithDescendants(comments, commentId))
      toast.success("Comment deleted.")
    })
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", gallerySans())}>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-0.5"
      >
        {flattened.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No comments yet — say something?
          </p>
        ) : (
          <ul className="space-y-2.5">
            {flattened.map((comment) => {
              const mine = viewerId === comment.created_by
              return (
                <li
                  key={comment.id}
                  data-comment-id={comment.id}
                  className={cn(
                    "rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors duration-700",
                    comment.depth > 0 && "ml-4 border-l-2 border-l-border",
                    highlightedId === comment.id &&
                      "gallery-comment-highlight border-amber-500/40 bg-amber-500/10"
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.commenter_name}
                    </span>
                    <span aria-hidden>·</span>
                    <time dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                    <FormattedCommentMentions
                      content={comment.body}
                      members={members}
                    />
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {isSignedIn ? (
                      <button
                        type="button"
                        onClick={() => setReplyTarget(comment.id)}
                        className={galleryPillClass()}
                      >
                        Reply
                      </button>
                    ) : null}
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => removeComment(comment.id)}
                        className={cn(
                          galleryPillClass(),
                          "text-destructive/90 hover:text-destructive"
                        )}
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

      <div className="relative mt-3 shrink-0 border-t border-border/50 pt-3">
        {replyTarget ? (
          <button
            type="button"
            onClick={() => setReplyTarget(null)}
            className={cn(
              gallerySans(),
              "mb-2 text-[11px] text-muted-foreground hover:text-foreground"
            )}
          >
            Cancel reply
          </button>
        ) : null}
        {showMentionPicker ? (
          <div className="absolute right-0 bottom-full left-0 z-50 mb-1 flex max-h-56 flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-md">
            {mentionPickerEmpty ? (
              <p className="px-3 py-2.5 text-xs text-muted-foreground">
                {members.length === 0
                  ? "No lab members loaded — sign in and refresh."
                  : "No matching names."}
              </p>
            ) : (
              <>
                <p
                  className={cn(
                    gallerySans(),
                    "shrink-0 border-b border-border/50 px-3 py-2 text-[10px] tracking-wide text-muted-foreground uppercase"
                  )}
                >
                  {mentionBrowseAll
                    ? `Lab members (${filteredMembers.length})`
                    : `${filteredMembers.length} match${filteredMembers.length === 1 ? "" : "es"}`}
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {filteredMembers.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => applyMention(m)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
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
              </>
            )}
          </div>
        ) : null}
        <div className="relative">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onSelect={(e) =>
              syncMentionQuery(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? e.currentTarget.value.length
              )
            }
            onClick={(e) =>
              syncMentionQuery(
                e.currentTarget.value,
                e.currentTarget.selectionStart ?? e.currentTarget.value.length
              )
            }
            placeholder={isSignedIn ? "Add a comment… @" : "Sign in to comment"}
            disabled={!isSignedIn || isPending}
            className="min-h-[3.25rem] resize-none rounded-xl border-border/60 bg-muted/20 pr-20 text-sm"
          />
          <Button
            type="button"
            size="sm"
            className={cn(
              gallerySans(),
              "absolute right-2 bottom-2 h-8 rounded-full px-3 text-xs"
            )}
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
