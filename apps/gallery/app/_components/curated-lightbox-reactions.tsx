"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { ReactionBar } from "@/app/_components/reaction-bar"
import { setGalleryReaction } from "@/app/actions"
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
import { describeSignInBeforeReact } from "@/lib/gallery/validation-toasts"
import { createClient } from "@/lib/supabase/client"

/** Reactions + R shortcut for album / Memories lightboxes. */
export function CuratedLightboxReactions({
  open,
  imageId,
  signedIn,
  viewerId,
  viewerName,
}: {
  open: boolean
  imageId: string
  signedIn: boolean
  viewerId: string | null
  viewerName: string
}) {
  const [counts, setCounts] = useState<ReactionCounts>(EMPTY_REACTION_COUNTS)
  const [myReaction, setMyReaction] = useState<GalleryReaction | null>(null)
  const [namesByReaction, setNamesByReaction] =
    useState<ReactionNames>(EMPTY_REACTION_NAMES)
  const [reactionsAvailable, setReactionsAvailable] = useState(true)
  const [openSignal, setOpenSignal] = useState(0)
  const [pending, startTransition] = useTransition()
  const openRef = useRef(open)
  openRef.current = open

  const refresh = useCallback(async () => {
    if (!openRef.current) return
    const supabase = createClient()
    const social = await loadLightboxSocial(supabase, imageId, viewerId)
    if (!openRef.current) return
    setCounts(social.reaction_counts)
    setMyReaction(social.my_reaction)
    setNamesByReaction(social.reaction_names)
    setReactionsAvailable(social.reactionsAvailable)
  }, [imageId, viewerId])

  useEffect(() => {
    if (!open) {
      setCounts(EMPTY_REACTION_COUNTS)
      setMyReaction(null)
      setNamesByReaction(EMPTY_REACTION_NAMES)
      setReactionsAvailable(true)
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

  if (!open || !reactionsAvailable) return null

  return (
    <ReactionBar
      counts={counts}
      myReaction={myReaction}
      canReact={signedIn && !pending}
      busy={pending}
      openSignal={openSignal}
      onReact={onReact}
    />
  )
}
