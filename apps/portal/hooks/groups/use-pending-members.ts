"use client"

// Google's member list is eventually consistent: an address just added can
// be missing from the next list call for several seconds, and one just
// removed can linger. So the page shows what the action reported, overlaid
// on Google's list, and re-reads Google a little later instead of right
// away — again, backing off, while the two still disagree. An overlay entry
// drops off once a re-read agrees with it, or when the retries run out:
// then Google's list is shown as it is. Without that bound, an address
// Google lists under another spelling would read "同步中" forever.

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import {
  applyPending,
  NO_PENDING,
  prunePending,
  withAdded,
  withRemoved,
  type PendingChanges,
  type ShownMember,
} from "@/lib/groups/plan"
import type { GroupMember } from "@/lib/groups/types"

/** Re-reads at 5 s, 15 s and 35 s after a change. */
const REFRESH_DELAYS_MS = [5000, 10000, 20000]
/** After the last re-read, how long its answer gets before the overlay goes. */
const GIVE_UP_AFTER_MS = 10000

const settled = (p: PendingChanges) =>
  p.added.length === 0 && p.removed.length === 0

export function usePendingMembers(members: GroupMember[]): {
  shown: ShownMember[]
  markAdded: (emails: string[]) => void
  markRemoved: (email: string) => void
  /** Re-read soon even with nothing pending, e.g. after a batch that stopped part-way. */
  refreshSoon: () => void
} {
  const router = useRouter()
  const [pending, setPending] = useState<PendingChanges>(NO_PENDING)

  // A fresh list from the server (router.refresh) settles whatever it now
  // agrees with. Adjusting state while rendering, React's documented
  // pattern for "state derived from a changed prop".
  const [seen, setSeen] = useState(members)
  if (seen !== members) {
    setSeen(members)
    setPending((p) => prunePending(members, p))
  }

  // The timers fire long after the render that set them, so they read the
  // overlay through a ref that is brought up to date after each commit.
  const latest = useRef(pending)
  useEffect(() => {
    latest.current = pending
  }, [pending])

  // One timer at a time; leaving the page cancels it, so no refresh lands on
  // whatever route comes next.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  function schedule(attempt: number, force = false) {
    if (timer.current) clearTimeout(timer.current)
    const delay = REFRESH_DELAYS_MS[attempt]
    timer.current = setTimeout(() => {
      timer.current = null
      if (!force && settled(latest.current)) return
      if (delay === undefined) {
        setPending(NO_PENDING)
        return
      }
      router.refresh()
      schedule(attempt + 1)
    }, delay ?? GIVE_UP_AFTER_MS)
  }

  return {
    shown: applyPending(members, pending),
    markAdded(emails) {
      if (emails.length === 0) return
      setPending((p) => withAdded(p, emails))
      schedule(0)
    },
    markRemoved(email) {
      setPending((p) => withRemoved(p, email))
      schedule(0)
    },
    refreshSoon() {
      schedule(0, true)
    },
  }
}
