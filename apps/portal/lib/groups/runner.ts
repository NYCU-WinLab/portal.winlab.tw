// Drives the batches of lib/groups/progress.ts: one chunk in flight at a
// time (the browser runs server actions one after another anyway), groups
// taking turns so a big batch on one list doesn't hold up another. No React
// here; hooks/groups/use-batch-runner.ts wires it to the page.

import {
  applyOutcome,
  classifyChunk,
  markDispatched,
  newJob,
  nextChunk,
  pickNext,
  stopJob,
  type BatchJob,
  type ChunkReply,
  type NewBatch,
} from "@/lib/groups/progress"
import type { GroupsResult, MemberChangeResult } from "@/lib/groups/types"

export type Dispatch = (
  groupId: string,
  emails: string[]
) => Promise<GroupsResult<MemberChangeResult[]>>

export type RunnerEvents = {
  onChange: (jobs: readonly BatchJob[]) => void
  onLanded: (groupId: string, emails: string[]) => void
  onUncertain: (groupId: string) => void
}

export type BatchRunner = {
  enqueue: (b: NewBatch) => void
  /** For good: nothing more is sent, and a reply still on its way is dropped. */
  stop: () => void
  /** Resolves once nothing is being dispatched — for tests. */
  idle: () => Promise<void>
}

// Ids count up across runners, not per runner: a batch's toast is keyed by
// its id and sonner keeps every toast for the life of the page, so a runner
// built on a later visit to /groups must not reuse an earlier one's ids.
let nextId = 1

export function createBatchRunner(
  dispatch: Dispatch,
  events: RunnerEvents
): BatchRunner {
  let jobs: BatchJob[] = []
  let seq = 0
  const served = new Map<string, number>()
  let pumping: Promise<void> = Promise.resolve()
  let active = false
  let stopped = false

  const update = (
    match: (j: BatchJob) => boolean,
    f: (j: BatchJob) => BatchJob
  ) => {
    jobs = jobs.map((j) => (match(j) ? f(j) : j))
  }

  async function pump() {
    try {
      for (
        let job = pickNext(jobs, served);
        job;
        job = pickNext(jobs, served)
      ) {
        const { id, groupId } = job
        const chunk = nextChunk(job)
        served.set(groupId, seq++)
        update(
          (j) => j.id === id,
          (j) => markDispatched(j, chunk)
        )
        events.onChange(jobs)

        let reply: ChunkReply
        try {
          reply = await dispatch(groupId, chunk)
        } catch {
          reply = { status: "thrown" }
        }
        if (stopped) return

        const outcome = classifyChunk(chunk, reply)
        update(
          (j) => j.id === id,
          (j) => applyOutcome(j, outcome)
        )
        if (outcome.landed.length) events.onLanded(groupId, outcome.landed)
        if (outcome.recheck) events.onUncertain(groupId)
        if (outcome.stop) {
          const global = outcome.stop === "global"
          update(
            (j) => !j.done && (global || j.groupId === groupId),
            (j) => stopJob(j, outcome.detail)
          )
        }
        events.onChange(jobs)
      }
    } finally {
      active = false
    }
  }

  return {
    enqueue(b) {
      if (stopped || b.emails.length === 0) return
      jobs = [...jobs, newJob(nextId++, b)]
      events.onChange(jobs)
      if (active) return
      active = true
      pumping = pump()
    },
    stop() {
      stopped = true
    },
    idle: () => pumping,
  }
}
