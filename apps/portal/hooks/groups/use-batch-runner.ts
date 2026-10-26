"use client"

// The page side of lib/groups/runner.ts: one runner for as long as /groups
// is open (the provider in its layout owns this hook), a toast per batch
// kept in step with it, and a "leave this page?" prompt while anything is
// still to be sent. Leaving /groups stops the runner: the chunk in flight
// finishes on the server, the rest is never sent.

import { useCallback, useEffect, useRef, useState } from "react"

import { showBatchToast } from "@/app/groups/_components/batch-progress"
import { jobView, type BatchJob, type NewBatch } from "@/lib/groups/progress"
import {
  createBatchRunner,
  type BatchRunner,
  type Dispatch,
} from "@/lib/groups/runner"

export function useBatchRunner(opts: {
  dispatch: Dispatch
  onLanded: (groupId: string, emails: string[]) => void
  onUncertain: (groupId: string) => void
  onRetry: (groupId: string, emails: string[]) => void
}): { enqueue: (b: NewBatch) => void; jobs: readonly BatchJob[] } {
  const [jobs, setJobs] = useState<readonly BatchJob[]>([])

  // The runner outlives renders; it reaches the latest callbacks through
  // this ref.
  const latest = useRef(opts)
  useEffect(() => {
    latest.current = opts
  })

  const runner = useRef<BatchRunner | null>(null)
  useEffect(() => {
    // What each batch's toast last showed, so an unchanged view isn't
    // re-sent to sonner on every chunk of another batch.
    const shown = new Map<number, string>()
    const r = createBatchRunner(
      (groupId, emails) => latest.current.dispatch(groupId, emails),
      {
        onChange(next) {
          setJobs(next)
          for (const job of next) {
            const view = jobView(job, next)
            const key = JSON.stringify(view)
            if (shown.get(job.id) === key) continue
            shown.set(job.id, key)
            showBatchToast(job, view, (groupId, emails) =>
              latest.current.onRetry(groupId, emails)
            )
          }
        },
        onLanded: (groupId, emails) => latest.current.onLanded(groupId, emails),
        onUncertain: (groupId) => latest.current.onUncertain(groupId),
        onError: (error) => console.error("groups: an add chunk failed", error),
      }
    )
    runner.current = r
    return () => {
      r.stop()
      runner.current = null
    }
  }, [])

  const enqueue = useCallback((b: NewBatch) => runner.current?.enqueue(b), [])

  // Closing or reloading the tab would drop what hasn't been sent yet.
  const sending = jobs.some((j) => !j.done)
  useEffect(() => {
    if (!sending) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [sending])

  return { enqueue, jobs }
}
