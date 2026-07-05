"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"

import { IconPin, IconThumbUp } from "@tabler/icons-react"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import {
  addGalleryComment,
  deleteGalleryComment,
  setGalleryCommentPin,
  toggleGalleryCommentLike,
  updateGalleryComment,
} from "@/app/actions"
import { galleryPillClass, gallerySans } from "@/components/gallery-chrome"
import { FormattedCommentMentions } from "@/lib/gallery/format-comment-mentions"
import { flattenGalleryComments } from "@/lib/gallery/sort-comments"
import type { GalleryComment, GalleryMember } from "@/lib/gallery/types"

export function GalleryComments({
  imageId,
  comments,
  onCommentsChange,
  isSignedIn,
  viewerId,
  viewerName,
  members,
  isAdmin = false,
  highlightCommentId = null,
}: {
  imageId: string
  comments: GalleryComment[]
  onCommentsChange: (comments: GalleryComment[]) => void
  isSignedIn: boolean
  viewerId: string | null
  viewerName: string
  members: GalleryMember[]
  isAdmin?: boolean
  highlightCommentId?: string | null
}) {
  const [draft, setDraft] = useState("")
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const flattened = useMemo(() => flattenGalleryComments(comments), [comments])

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
          updated_at: result.data.updated_at ?? null,
          pinned_at: result.data.pinned_at ?? null,
          like_count: result.data.like_count ?? 0,
          liked_by_me: result.data.liked_by_me ?? false,
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
      if (editingId === commentId) {
        setEditingId(null)
        setEditDraft("")
      }
      toast.success("Comment deleted.")
    })
  }

  const startEdit = (comment: GalleryComment) => {
    setReplyTarget(null)
    setEditingId(comment.id)
    setEditDraft(comment.body)
    setMentionQuery(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft("")
  }

  const saveEdit = (commentId: string) => {
    const body = editDraft.trim()
    if (!body) return

    startTransition(async () => {
      const result = await updateGalleryComment(commentId, body)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onCommentsChange(
        comments.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                body: result.data.body,
                updated_at: result.data.updated_at,
              }
            : comment
        )
      )
      setEditingId(null)
      setEditDraft("")
      toast.success("Comment updated.")
    })
  }

  const toggleLike = (commentId: string) => {
    startTransition(async () => {
      const result = await toggleGalleryCommentLike(commentId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onCommentsChange(
        comments.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                liked_by_me: result.data.liked,
                like_count: result.data.like_count,
              }
            : comment
        )
      )
    })
  }

  const togglePin = (comment: GalleryComment) => {
    const nextPinned = !comment.pinned_at
    startTransition(async () => {
      const result = await setGalleryCommentPin(comment.id, nextPinned)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onCommentsChange(
        comments.map((row) => {
          if (row.image_id !== comment.image_id || row.parent_id) return row
          if (row.id === comment.id) {
            return { ...row, pinned_at: result.data.pinned_at }
          }
          if (nextPinned) {
            return { ...row, pinned_at: null }
          }
          return row
        })
      )
      toast.success(nextPinned ? "Comment pinned." : "Comment unpinned.")
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
              const isEditing = editingId === comment.id
              const edited = isCommentEdited(comment)
              const canPin =
                isAdmin && comment.parent_id === null && comment.depth === 0
              return (
                <li
                  key={comment.id}
                  data-comment-id={comment.id}
                  className={cn(
                    "rounded-xl border border-border/50 bg-muted/30 px-3 py-2.5 transition-colors duration-700",
                    comment.depth > 0 && "ml-4 border-l-2 border-l-border",
                    comment.pinned_at && "border-amber-500/30 bg-amber-500/5",
                    highlightedId === comment.id &&
                      "gallery-comment-highlight border-amber-500/40 bg-amber-500/10"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {comment.commenter_name}
                    </span>
                    {comment.pinned_at ? (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                        <IconPin className="size-3" aria-hidden />
                        Pinned
                      </span>
                    ) : null}
                    <span aria-hidden>·</span>
                    <time dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                    {edited ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>edited</span>
                      </>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="mt-1.5 space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        disabled={isPending}
                        className="min-h-[3.25rem] resize-none rounded-xl border-border/60 bg-background text-sm"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className={cn(
                            gallerySans(),
                            "h-8 rounded-full px-3 text-xs"
                          )}
                          disabled={isPending || !editDraft.trim()}
                          onClick={() => saveEdit(comment.id)}
                        >
                          Save
                        </Button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isPending}
                          className={galleryPillClass()}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1.5 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
                      <FormattedCommentMentions
                        content={comment.body}
                        members={members}
                      />
                    </p>
                  )}
                  {!isEditing ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleLike(comment.id)}
                        disabled={!isSignedIn || isPending}
                        className={cn(
                          galleryPillClass(),
                          "inline-flex items-center gap-1",
                          comment.liked_by_me && "text-foreground"
                        )}
                        aria-pressed={comment.liked_by_me}
                      >
                        <IconThumbUp
                          className={cn(
                            "size-3.5",
                            comment.liked_by_me && "fill-current"
                          )}
                          aria-hidden
                        />
                        {comment.like_count > 0 ? comment.like_count : "Like"}
                      </button>
                      {isSignedIn ? (
                        <button
                          type="button"
                          onClick={() => setReplyTarget(comment.id)}
                          className={galleryPillClass()}
                        >
                          Reply
                        </button>
                      ) : null}
                      {canPin ? (
                        <button
                          type="button"
                          onClick={() => togglePin(comment)}
                          disabled={isPending}
                          className={cn(
                            galleryPillClass(),
                            comment.pinned_at &&
                              "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {comment.pinned_at ? "Unpin" : "Pin"}
                        </button>
                      ) : null}
                      {mine ? (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(comment)}
                            className={galleryPillClass()}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTargetId(comment.id)}
                            className={cn(
                              galleryPillClass(),
                              "text-destructive/90 hover:text-destructive"
                            )}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
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

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the comment and any replies. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTargetId) return
                removeComment(deleteTargetId)
                setDeleteTargetId(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function isCommentEdited(comment: GalleryComment): boolean {
  if (!comment.updated_at) return false
  return (
    new Date(comment.updated_at).getTime() >
    new Date(comment.created_at).getTime()
  )
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
