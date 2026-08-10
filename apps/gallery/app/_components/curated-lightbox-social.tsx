"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { GalleryAddToAlbum } from "@/app/_components/gallery-add-to-album"
import { GalleryComments } from "@/app/_components/gallery-comments"
import { GalleryImageTags } from "@/app/_components/gallery-image-tags"
import { ReactionBar } from "@/app/_components/reaction-bar"
import { setGalleryReaction } from "@/app/actions"
import { listGalleryImageTags } from "@/app/actions/tags"
import { gallerySans } from "@/components/gallery-chrome"
import { isTypingTarget } from "@/lib/gallery/keyboard"
import { loadLightboxSocial } from "@/lib/gallery/lightbox-social"
import { resolveLightboxShortcut } from "@/lib/gallery/lightbox-shortcuts"
import { nextReactionState } from "@/lib/gallery/reaction-optimistic"
import { describeReactionOutcome } from "@/lib/gallery/reaction-outcome"
import {
  EMPTY_REACTION_COUNTS,
  EMPTY_REACTION_NAMES,
  type GalleryReaction,
  type ReactionCounts,
  type ReactionNames,
} from "@/lib/gallery/reactions"
import type { GalleryComment, GalleryMember } from "@/lib/gallery/types"
import type { GalleryTag } from "@/lib/gallery/tags"
import { describeSignInBeforeReact } from "@/lib/gallery/validation-toasts"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@workspace/ui/lib/utils"

/** Reactions, comments, tags, add-to-album for album / Memories lightboxes. */
export function CuratedLightboxSocial({
  open,
  imageId,
  signedIn,
  viewerId,
  viewerName,
  isAdmin = false,
  albumsAvailable = true,
}: {
  open: boolean
  imageId: string
  signedIn: boolean
  viewerId: string | null
  viewerName: string
  isAdmin?: boolean
  albumsAvailable?: boolean
}) {
  const [counts, setCounts] = useState<ReactionCounts>(EMPTY_REACTION_COUNTS)
  const [myReaction, setMyReaction] = useState<GalleryReaction | null>(null)
  const [namesByReaction, setNamesByReaction] =
    useState<ReactionNames>(EMPTY_REACTION_NAMES)
  const [reactionsAvailable, setReactionsAvailable] = useState(true)
  const [comments, setComments] = useState<GalleryComment[]>([])
  const [commentsAvailable, setCommentsAvailable] = useState(true)
  const [commentPinAvailable, setCommentPinAvailable] = useState(true)
  const [commentLikesAvailable, setCommentLikesAvailable] = useState(true)
  const [members, setMembers] = useState<GalleryMember[]>([])
  const [tags, setTags] = useState<GalleryTag[]>([])
  const [tagsAvailable, setTagsAvailable] = useState(true)
  const [openSignal, setOpenSignal] = useState(0)
  const [pending, startTransition] = useTransition()
  const openRef = useRef(open)
  openRef.current = open

  const refresh = useCallback(async () => {
    if (!openRef.current) return
    const supabase = createClient()
    const [social, tagResult, memberResult] = await Promise.all([
      loadLightboxSocial(supabase, imageId, viewerId),
      listGalleryImageTags(imageId),
      supabase
        .from("user_profiles")
        .select("id, name")
        .order("name")
        .limit(200),
    ])
    if (!openRef.current) return
    setCounts(social.reaction_counts)
    setMyReaction(social.my_reaction)
    setNamesByReaction(social.reaction_names)
    setReactionsAvailable(social.reactionsAvailable)
    setComments(social.comments)
    setCommentsAvailable(true)
    setCommentPinAvailable(social.commentPinAvailable)
    setCommentLikesAvailable(social.commentLikesAvailable)
    if (tagResult.ok) {
      setTags(tagResult.data)
      setTagsAvailable(true)
    } else {
      setTags([])
      setTagsAvailable(false)
    }
    if (!memberResult.error) {
      setMembers(
        (
          (memberResult.data ?? []) as { id: string; name: string | null }[]
        ).map((row) => ({
          id: row.id,
          name: row.name,
          email: null,
        }))
      )
    }
  }, [imageId, viewerId])

  useEffect(() => {
    if (!open) {
      setCounts(EMPTY_REACTION_COUNTS)
      setMyReaction(null)
      setNamesByReaction(EMPTY_REACTION_NAMES)
      setReactionsAvailable(true)
      setComments([])
      setTags([])
      return
    }
    void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      const action = resolveLightboxShortcut(event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
      if (action !== "react") return
      event.preventDefault()
      if (!reactionsAvailable || !signedIn) {
        if (!signedIn) toast.error(describeSignInBeforeReact())
        return
      }
      setOpenSignal((n) => n + 1)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, reactionsAvailable, signedIn])

  const onReact = (reaction: GalleryReaction) => {
    if (pending) return
    if (!signedIn) {
      toast.error(describeSignInBeforeReact())
      return
    }
    startTransition(async () => {
      const result = await setGalleryReaction(imageId, reaction)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const next = nextReactionState(
        myReaction,
        reaction,
        viewerName,
        counts,
        namesByReaction
      )
      setCounts(next.counts)
      setNamesByReaction(next.names)
      setMyReaction(next.myReaction)
      toast.success(describeReactionOutcome(next.outcome))
    })
  }

  if (!open) return null

  return (
    <div className={cn("space-y-3", gallerySans())}>
      {reactionsAvailable ? (
        <ReactionBar
          counts={counts}
          myReaction={myReaction}
          canReact={signedIn && !pending}
          busy={pending}
          openSignal={openSignal}
          onReact={onReact}
        />
      ) : null}
      {tagsAvailable ? (
        <GalleryImageTags imageId={imageId} tags={tags} canEdit={signedIn} />
      ) : null}
      {signedIn && albumsAvailable ? (
        <GalleryAddToAlbum imageIds={[imageId]} />
      ) : null}
      {commentsAvailable ? (
        <div className="max-h-[min(40vh,22rem)] min-h-[10rem] overflow-hidden rounded-xl border border-border/50 bg-background/70">
          <GalleryComments
            imageId={imageId}
            comments={comments}
            onCommentsChange={setComments}
            isSignedIn={signedIn}
            viewerId={viewerId}
            viewerName={viewerName}
            members={members}
            isAdmin={isAdmin}
            commentPinAvailable={commentPinAvailable}
            commentLikesAvailable={commentLikesAvailable}
          />
        </div>
      ) : null}
    </div>
  )
}
