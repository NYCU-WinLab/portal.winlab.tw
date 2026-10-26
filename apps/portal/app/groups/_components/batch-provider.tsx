"use client"

// The 同步中 overlay lives here, above the group pages, so it outlives
// them: a change noted for a group whose page isn't open (the member moved
// on to another group) still marks its addresses, and coming back shows
// them. Each open group page subscribes for its own group and runs the
// re-reads (hooks/groups/use-pending-members.ts); with no page subscribed a
// note only updates the overlay, and the page starts reading when it mounts.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import {
  NO_OVERLAY,
  overlayAdded,
  overlayRemoved,
  overlayRetry,
  type Overlay,
} from "@/lib/groups/plan"

type Listener = (forced: boolean) => void

export type GroupsBatch = {
  overlayOf: (groupId: string) => Overlay
  updateOverlay: (groupId: string, fn: (o: Overlay) => Overlay) => void
  /** The page's poller for this group; `forced` = an uncertain outcome. */
  subscribe: (groupId: string, listener: Listener) => () => void
  noteAdded: (groupId: string, emails: string[]) => void
  noteRemoved: (groupId: string, email: string) => void
  noteUncertain: (groupId: string) => void
}

const GroupsBatchContext = createContext<GroupsBatch | null>(null)

export function GroupsBatchProvider({ children }: { children: ReactNode }) {
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({})
  const [listeners] = useState(() => new Map<string, Set<Listener>>())

  const actions = useMemo(() => {
    function updateOverlay(groupId: string, fn: (o: Overlay) => Overlay) {
      setOverlays((all) => {
        const prev = all[groupId] ?? NO_OVERLAY
        const next = fn(prev)
        return next === prev ? all : { ...all, [groupId]: next }
      })
    }
    function notify(groupId: string, forced: boolean) {
      for (const listener of listeners.get(groupId) ?? []) listener(forced)
    }
    return {
      updateOverlay,
      subscribe(groupId: string, listener: Listener) {
        const set = listeners.get(groupId) ?? new Set<Listener>()
        set.add(listener)
        listeners.set(groupId, set)
        return () => {
          set.delete(listener)
          if (set.size === 0 && listeners.get(groupId) === set)
            listeners.delete(groupId)
        }
      },
      noteAdded(groupId: string, emails: string[]) {
        if (emails.length === 0) return
        updateOverlay(groupId, (o) => overlayAdded(o, emails))
        notify(groupId, false)
      },
      noteRemoved(groupId: string, email: string) {
        updateOverlay(groupId, (o) => overlayRemoved(o, email))
        notify(groupId, false)
      },
      noteUncertain(groupId: string) {
        updateOverlay(groupId, overlayRetry)
        notify(groupId, true)
      },
    }
  }, [listeners])

  const value = useMemo<GroupsBatch>(
    () => ({
      ...actions,
      overlayOf: (groupId) => overlays[groupId] ?? NO_OVERLAY,
    }),
    [actions, overlays]
  )

  return (
    <GroupsBatchContext.Provider value={value}>
      {children}
    </GroupsBatchContext.Provider>
  )
}

export function useGroupsBatch(): GroupsBatch {
  const batch = useContext(GroupsBatchContext)
  if (!batch) throw new Error("useGroupsBatch outside GroupsBatchProvider")
  return batch
}
