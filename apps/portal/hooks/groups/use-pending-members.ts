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

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import {
  applyPending,
  nextPollStep,
  NO_OVERLAY,
  overlayAdded,
  overlayGiveUp,
  overlayOnList,
  overlayRemoved,
  overlayRetry,
  POLL_IDLE,
  pollCompleted,
  pollGaveUp,
  pollIssued,
  pollNewWindow,
  type Overlay,
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
  members: GroupMember[],
  /** The latest read of Google failed; `members` is the last good one. */
  stale: boolean
): {
  shown: ShownMember[]
  markAdded: (emails: string[]) => void
  markRemoved: (email: string) => void
  /**
   * Re-read soon even with nothing pending, after an outcome that may have
   * landed (a timeout, a batch that stopped part-way). Reads a bounded
   * number of times over the consistency window, then stops.
   */
  refreshSoon: () => void
} {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [overlay, setOverlay] = useState<Overlay>(NO_OVERLAY)

  // A fresh list from the server (router.refresh) settles whatever it now
  // agrees with. Adjusting state while rendering, React's documented
  // pattern for "state derived from a changed prop". A failed read keeps
  // the same `members`, so only a good one lands here.
  const [seen, setSeen] = useState(members)
  if (seen !== members) {
    setSeen(members)
    setOverlay((o) => overlayOnList(o, members, stale))
  }

  // Timers and effects act long after the render that set them up, so they
  // read the overlay and the stale flag through refs brought up to date
  // after each commit. Declared before the completion effect below, so it
  // sees this commit's values.
  const latest = useRef(overlay)
  const latestStale = useRef(stale)
  useEffect(() => {
    latest.current = overlay
    latestStale.current = stale
  }, [overlay, stale])

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
        setOverlay((o) => overlayGiveUp(o, wasStale))
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

  return {
    shown: applyPending(members, overlay.pending),
    markAdded(emails) {
      if (emails.length === 0) return
      setOverlay((o) => overlayAdded(o, emails))
      startWindow(0)
    },
    markRemoved(email) {
      setOverlay((o) => overlayRemoved(o, email))
      startWindow(0)
    },
    refreshSoon() {
      setOverlay(overlayRetry)
      startWindow(FORCED_READS)
    },
  }
}
