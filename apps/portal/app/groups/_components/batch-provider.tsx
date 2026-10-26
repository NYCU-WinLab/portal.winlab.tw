"use client"

// What /groups keeps across its pages: the add batches being sent in the
// background (hooks/groups/use-batch-runner.ts) and the 同步中 overlay. A
// batch keeps going while the member opens another group, so both live
// here, above the group pages: a change noted for a group whose page isn't
// open still marks its addresses, and coming back shows them. Each open
// group page subscribes for its own group and runs the re-reads
// (hooks/groups/use-pending-members.ts); with no page subscribed a note only
// updates the overlay, and the page starts reading when it mounts.

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { useBatchRunner } from "@/hooks/groups/use-batch-runner"
import {
  NO_OVERLAY,
  overlayAdded,
  overlayRemoved,
  overlayRetry,
  type Overlay,
} from "@/lib/groups/plan"
import type { BatchJob, NewBatch } from "@/lib/groups/progress"
import type { Dispatch } from "@/lib/groups/runner"

import { addGroupMembers, removeGroupMember } from "../actions"

type Listener = (forced: boolean) => void

export type GroupsBatch = {
  overlayOf: (groupId: string) => Overlay
  updateOverlay: (groupId: string, fn: (o: Overlay) => Overlay) => void
  /** The page's poller for this group; `forced` = an uncertain outcome. */
  subscribe: (groupId: string, listener: Listener) => () => void
  noteAdded: (groupId: string, emails: string[]) => void
  noteRemoved: (groupId: string, email: string) => void
  noteUncertain: (groupId: string) => void
  /** Send an add in the background; its toast reports how it goes. */
  enqueue: (b: NewBatch) => void
  jobs: readonly BatchJob[]
  /** Addresses a failed batch's 重新加入 put back into the add dialog. */
  prefillOf: (groupId: string) => string[] | null
  clearPrefill: (groupId: string) => void
  remove: typeof removeGroupMember
}

const GroupsBatchContext = createContext<GroupsBatch | null>(null)

export function GroupsBatchProvider({
  children,
  dispatch = addGroupMembers,
  remove = removeGroupMember,
}: {
  children: ReactNode
  /** Sends one chunk; a stand-in only for previewing the UI. */
  dispatch?: Dispatch
  /** Removes one member; a stand-in only for previewing the UI. */
  remove?: typeof removeGroupMember
}) {
  const router = useRouter()
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({})
  const [listeners] = useState(() => new Map<string, Set<Listener>>())
  const [prefill, setPrefill] = useState<Record<string, string[]>>({})

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

  // 重新加入 doesn't send anything by itself: it opens the group's add
  // dialog with those addresses filled in, for the member to look over.
  const onRetry = useCallback(
    (groupId: string, emails: string[]) => {
      setPrefill((p) => ({ ...p, [groupId]: emails }))
      router.push(`/groups/${groupId}`)
    },
    [router]
  )
  const clearPrefill = useCallback((groupId: string) => {
    setPrefill((p) => {
      if (!(groupId in p)) return p
      const rest = { ...p }
      delete rest[groupId]
      return rest
    })
  }, [])

  const { enqueue, jobs } = useBatchRunner({
    dispatch,
    onLanded: actions.noteAdded,
    onUncertain: actions.noteUncertain,
    onRetry,
  })

  const value = useMemo<GroupsBatch>(
    () => ({
      ...actions,
      overlayOf: (groupId) => overlays[groupId] ?? NO_OVERLAY,
      enqueue,
      jobs,
      prefillOf: (groupId) => prefill[groupId] ?? null,
      clearPrefill,
      remove,
    }),
    [actions, overlays, enqueue, jobs, prefill, clearPrefill, remove]
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
