"use client"

// Google's member list is eventually consistent: an address just added can
// be missing from the next list call for several seconds, and one just
// removed can linger. So the page shows what the action reported, overlaid
// on Google's list, and re-reads Google a little later instead of right
// away — again, backing off, while the two still disagree. An overlay entry
// drops off once a re-read agrees with it, or when the retries run out:
// then Google's list is shown as it is. Without that bound, an address
// Google lists under another spelling would read "同步中" forever.
//
// Each re-read is a router.refresh() run in a transition, so the hook knows
// when its result has rendered. Only completed reads count, the next one is
// scheduled after the previous finished, and the give-up waits for the last
// one and decides from it: a slow render can't make a confirmed change
// vanish before any read could show it. If that last read failed, the list
// on screen is the last good one and proves nothing, so the overlay stays
// (no more polling) and the first successful read after that settles it. A
// new action starts a fresh window, deferral included. The decisions live in
// lib/groups/plan.ts.
//
// The overlay itself is kept by the /groups provider
// (app/groups/_components/batch-provider.tsx), so a change that finishes
// while this page is closed is still shown when it opens; this hook runs
// the re-reads for the one group on screen.

import { useRouter } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"

import { useGroupsBatch } from "@/app/groups/_components/batch-provider"
import {
  applyPending,
  nextPollStep,
  overlayGiveUp,
  overlayOnList,
  POLL_IDLE,
  pollCompleted,
  pollGaveUp,
  pollIssued,
  pollNewWindow,
  type PendingChanges,
  type ShownMember,
} from "@/lib/groups/plan"
import type { GroupMember } from "@/lib/groups/types"

/** Gaps before each re-read; each counts from the previous one's completion. */
const REFRESH_DELAYS_MS = [5000, 10000, 20000]
/** Re-reads an uncertain outcome gets, out of the ones above. */
const FORCED_READS = REFRESH_DELAYS_MS.length

const settled = (p: PendingChanges) =>
  p.added.length === 0 && p.removed.length === 0

export function usePendingMembers(
  groupId: string,
  members: GroupMember[],
  /** The latest read of Google failed; `members` is the last good one. */
  stale: boolean
): { shown: ShownMember[] } {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { overlayOf, updateOverlay, subscribe } = useGroupsBatch()
  const overlay = overlayOf(groupId)

  // Timers and effects act long after the render that set them up, so they
  // read the overlay and the stale flag through refs brought up to date
  // after each commit. Declared before the effects below, so they see this
  // commit's values.
  const latest = useRef(overlay)
  const latestStale = useRef(stale)
  useEffect(() => {
    latest.current = overlay
    latestStale.current = stale
  }, [overlay, stale])

  // A fresh list from the server (router.refresh, or the page opening)
  // settles whatever it now agrees with. The provider's state only catches
  // up on the next render, so the ref is settled here too: a re-read that
  // completes in this same commit must decide from the settled overlay.
  useEffect(() => {
    latest.current = overlayOnList(latest.current, members, stale)
    updateOverlay(groupId, (o) => overlayOnList(o, members, stale))
  }, [groupId, members, stale, updateOverlay])

  // One timer at a time; leaving the page cancels it, so no refresh lands on
  // whatever route comes next.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A result can arrive after the page is gone and ask for a refresh; once
  // unmounted nothing may be scheduled again. (Set on every mount, so React
  // strict mode's mount/unmount/mount leaves it live.)
  const unmounted = useRef(false)
  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  // Reads done, owed and in flight. Only touched outside render.
  const poll = useRef(POLL_IDLE)

  function step() {
    timer.current = null
    if (unmounted.current) return
    const next = nextPollStep(poll.current, {
      settled: settled(latest.current.pending),
      stale: latestStale.current,
      reads: REFRESH_DELAYS_MS.length,
    })
    switch (next) {
      case "wait": // the read's completion calls advance()
      case "stop":
        return
      case "refresh":
        poll.current = pollIssued(poll.current)
        startTransition(() => router.refresh())
        return
      case "give-up-clear":
      case "give-up-defer": {
        poll.current = pollGaveUp(poll.current)
        const wasStale = next === "give-up-defer"
        updateOverlay(groupId, (o) => overlayGiveUp(o, wasStale))
        return
      }
    }
  }

  // Wait out the gap before the window's next read, or, with none left,
  // decide right away from the read that just completed.
  function advance() {
    if (unmounted.current) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const delay = REFRESH_DELAYS_MS[poll.current.readsDone]
    if (delay === undefined) step()
    else timer.current = setTimeout(step, delay)
  }

  // Our refresh finished rendering: count it and move on.
  useEffect(() => {
    if (isPending || poll.current.inFlight === null) return
    poll.current = pollCompleted(poll.current)
    advance()
    // advance reads only refs; re-running on its identity would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending])

  function startWindow(forcedReads: number) {
    poll.current = pollNewWindow(poll.current, { forcedReads })
    // A read in flight belongs to the old window; its completion advances.
    if (poll.current.inFlight === null) advance()
  }

  // A change noted for this group starts a fresh window; one still unsettled
  // from before the page opened gets one too.
  useEffect(() => {
    const unsubscribe = subscribe(groupId, (forced) =>
      startWindow(forced ? FORCED_READS : 0)
    )
    if (!settled(latest.current.pending)) startWindow(0)
    return unsubscribe
    // startWindow reads only refs; re-running on its identity would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, subscribe])

  return { shown: applyPending(members, overlay.pending) }
}
