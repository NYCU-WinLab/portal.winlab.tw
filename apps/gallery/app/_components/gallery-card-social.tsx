"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type SetStateAction,
} from "react"
import { toast } from "sonner"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { ReactionGlyph } from "@/app/_components/reaction-glyph"
import { galleryPillClass } from "@/components/gallery-chrome"
import { setGalleryReaction } from "@/app/actions"
import { loadLightboxSocial } from "@/lib/gallery/lightbox-social"
import {
  GALLERY_REACTIONS,
  type GalleryReaction,
  type ReactionCounts,
  type ReactionNames,
  totalReactions,
} from "@/lib/gallery/reactions"
import type { GalleryComment, GalleryImage } from "@/lib/gallery/types"
import { createClient } from "@/lib/supabase/client"

export function applyReactionOptimistic(
  prev: GalleryReaction | null,
  reaction: GalleryReaction,
  viewerName: string,
  setCounts: Dispatch<SetStateAction<ReactionCounts>>,
  setNamesByReaction: Dispatch<SetStateAction<ReactionNames>>,
  setMyReaction: Dispatch<SetStateAction<GalleryReaction | null>>
) {
  if (prev === reaction) {
    setCounts((c) => ({
      ...c,
      [reaction]: Math.max(0, c[reaction] - 1),
    }))
    setNamesByReaction((n) => ({
      ...n,
      [reaction]: n[reaction].filter((name) => name !== viewerName),
    }))
    setMyReaction(null)
    return "removed" as const
  }
  if (prev) {
    setCounts((c) => ({
      ...c,
      [prev]: Math.max(0, c[prev] - 1),
      [reaction]: c[reaction] + 1,
    }))
    setNamesByReaction((n) => ({
      ...n,
      [prev]: n[prev].filter((name) => name !== viewerName),
      [reaction]: n[reaction].includes(viewerName)
        ? n[reaction]
        : [...n[reaction], viewerName],
    }))
    setMyReaction(reaction)
    return "updated" as const
  }
  setCounts((c) => ({ ...c, [reaction]: c[reaction] + 1 }))
  setNamesByReaction((n) => ({
    ...n,
    [reaction]: n[reaction].includes(viewerName)
      ? n[reaction]
      : [...n[reaction], viewerName],
  }))
  setMyReaction(reaction)
  return "added" as const
}

export function ReactionSummary({
  total,
  counts,
  namesByReaction,
}: {
  total: number
  counts: ReactionCounts
  namesByReaction: ReactionNames
}) {
  if (total === 0) return null

  const entries = GALLERY_REACTIONS.flatMap((reaction) =>
    namesByReaction[reaction].map((name) => ({ reaction, name }))
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            galleryPillClass(),
            "max-w-full flex-wrap gap-x-1.5 gap-y-1"
          )}
          aria-label="Show who reacted"
        >
          {GALLERY_REACTIONS.filter((r) => counts[r] > 0).map((reaction) => (
            <span
              key={reaction}
              className="inline-flex items-center gap-0.5 whitespace-nowrap"
            >
              <ReactionGlyph reaction={reaction} className="text-sm" />
              <span className="tabular-nums">{counts[reaction]}</span>
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-56 rounded-xl p-3"
      >
        <ul className="max-h-52 space-y-1.5 overflow-y-auto text-sm">
          {entries.map(({ reaction, name }, idx) => (
            <li
              key={`${reaction}-${name}-${idx}`}
              className="flex min-w-0 items-center gap-2 select-none"
            >
              <ReactionGlyph
                reaction={reaction}
                className="shrink-0 text-base"
              />
              <span className="truncate">{name}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

/** Reactions, comments, and realtime refresh for an open lightbox. */
export function useGalleryCardSocial({
  image,
  viewerId,
  viewerName,
  isSignedIn,
  isDialogOpen,
}: {
  image: GalleryImage
  viewerId: string | null
  viewerName: string
  isSignedIn: boolean
  isDialogOpen: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [counts, setCounts] = useState(image.reaction_counts)
  const [myReaction, setMyReaction] = useState(image.my_reaction)
  const [namesByReaction, setNamesByReaction] = useState(image.reaction_names)
  const [comments, setComments] = useState<GalleryComment[]>([])
  const [commentsLoaded, setCommentsLoaded] = useState(false)
  const [commentPinAvailable, setCommentPinAvailable] = useState(true)
  const [commentLikesAvailable, setCommentLikesAvailable] = useState(true)
  const viewerIdRef = useRef(viewerId)
  const isDialogOpenRef = useRef(isDialogOpen)
  const commentIdsRef = useRef<Set<string>>(new Set())

  const refreshTimerRef = useRef<number | null>(null)
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)

  const canReact = isSignedIn && !isPending
  const reactionTotal = totalReactions(counts)
  const wallCommentCount = commentsLoaded
    ? comments.length
    : image.comment_count

  useEffect(() => {
    viewerIdRef.current = viewerId
  }, [viewerId])

  useEffect(() => {
    isDialogOpenRef.current = isDialogOpen
  }, [isDialogOpen])

  useEffect(() => {
    commentIdsRef.current = new Set(comments.map((comment) => comment.id))
  }, [comments])

  const refreshSocial = useCallback(async () => {
    if (!isDialogOpenRef.current) return
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }

    refreshInFlightRef.current = true
    const supabase = createClient()
    try {
      const social = await loadLightboxSocial(
        supabase,
        image.id,
        viewerIdRef.current
      )
      if (!isDialogOpenRef.current) return

      setComments(social.comments)
      setCommentsLoaded(true)
      setCommentPinAvailable(social.commentPinAvailable)
      setCommentLikesAvailable(social.commentLikesAvailable)
      setCounts(social.reaction_counts)
      setNamesByReaction(social.reaction_names)
      setMyReaction(social.my_reaction)
    } finally {
      refreshInFlightRef.current = false
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        void refreshSocial()
      }
    }
  }, [image.id])

  const scheduleRefreshSocial = useCallback(() => {
    if (!isDialogOpenRef.current) return
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refreshSocial()
    }, 150)
  }, [refreshSocial])

  useEffect(() => {
    if (isDialogOpen) return
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    refreshQueuedRef.current = false
  }, [isDialogOpen])

  useEffect(() => {
    if (isDialogOpen) return
    setComments([])
    setCommentsLoaded(false)
    setCommentPinAvailable(true)
    setCommentLikesAvailable(true)
    setCounts(image.reaction_counts)
    setMyReaction(image.my_reaction)
    setNamesByReaction(image.reaction_names)
  }, [
    isDialogOpen,
    image.id,
    image.reaction_counts,
    image.my_reaction,
    image.reaction_names,
  ])

  useEffect(() => {
    if (!isDialogOpen) return
    void refreshSocial()
  }, [isDialogOpen, refreshSocial])

  useEffect(() => {
    if (!isDialogOpen) return

    const supabase = createClient()
    const onChange = () => scheduleRefreshSocial()

    const onCommentLikeChange = (payload: {
      new?: { comment_id?: string } | null
      old?: { comment_id?: string } | null
    }) => {
      const commentId = payload.new?.comment_id ?? payload.old?.comment_id
      if (
        typeof commentId === "string" &&
        commentIdsRef.current.size > 0 &&
        !commentIdsRef.current.has(commentId)
      ) {
        return
      }
      scheduleRefreshSocial()
    }
    const channel = supabase
      .channel(`gallery-lightbox-${image.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gallery_comments",
          filter: `image_id=eq.${image.id}`,
        },
        onChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gallery_image_votes",
          filter: `image_id=eq.${image.id}`,
        },
        onChange
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "gallery_comment_likes",
        },
        onCommentLikeChange
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isDialogOpen, image.id, scheduleRefreshSocial])

  const onReact = (reaction: GalleryReaction) => {
    if (!isSignedIn) {
      toast.error("Please sign in before reacting.")
      return
    }

    startTransition(async () => {
      const result = await setGalleryReaction(image.id, reaction)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      const outcome = applyReactionOptimistic(
        myReaction,
        reaction,
        viewerName,
        setCounts,
        setNamesByReaction,
        setMyReaction
      )
      if (outcome === "removed") toast.success("Reaction removed.")
      else if (outcome === "updated") toast.success("Reaction updated.")
      else toast.success("Reaction added.")
    })
  }

  return {
    counts,
    myReaction,
    namesByReaction,
    comments,
    setComments,
    canReact,
    reactionTotal,
    wallCommentCount,
    onReact,
    commentPinAvailable,
    commentLikesAvailable,
  }
}
