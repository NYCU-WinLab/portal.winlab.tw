// An add batch as the browser sends it: CHUNK_SIZE addresses at a time, each
// chunk one ordinary addGroupMembers call, so every server check, deadline
// and audit row applies to each chunk as it would to a whole batch. These
// are the pure parts: what each reply means for the batch, which batch goes
// next, what the page and the toast show. lib/groups/runner.ts drives them.

import { UNAUTHORIZED } from "@/lib/groups/messages"
import type { GroupsResult, MemberChangeResult } from "@/lib/groups/types"
import { mayHaveLanded } from "@/lib/groups/uncertain"

/** Addresses per addGroupMembers call: the toast moves every few seconds. */
export const CHUNK_SIZE = 10

/** Addresses named in a failure toast; the rest are counted. */
const LISTED_FAILURES = 5

export type NewBatch = { groupId: string; groupEmail: string; emails: string[] }

export type BatchJob = {
  id: number
  groupId: string
  groupEmail: string
  emails: string[]
  /** emails[0, dispatched) have been handed to dispatch. */
  dispatched: number
  /** Size of the chunk awaiting its reply; 0 when none. */
  inFlight: number
  added: number
  already: number
  failed: { email: string; detail: string }[]
  /** Sent with no per-address answer, and may have landed. */
  unknown: string[]
  /** Never sent: the batch stopped first. */
  unsent: string[]
  stopDetail: string | null
  done: boolean
}

/** What one chunk's call came back with; "thrown" when the action rejected. */
export type ChunkReply =
  | GroupsResult<MemberChangeResult[]>
  | {
      status: "thrown"
      /** The server no longer has the action, so it ran nothing. */
      missingAction: boolean
    }

/**
 * A chunk's call rejected. Next.js names the error it throws when a deploy
 * since the page loaded took the action away; anything else (the network,
 * a session that expired into a redirect) may have reached the server.
 */
export function thrownReply(error: unknown): ChunkReply {
  return {
    status: "thrown",
    missingAction:
      error instanceof Error && error.name === "UnrecognizedActionError",
  }
}

/**
 * How far a refusal reaches. "global" is about the caller or the service
 * account, so every group would get the same answer; "group" is this group.
 */
export type StopScope = "group" | "global"

export type ChunkOutcome = {
  added: number
  already: number
  failed: { email: string; detail: string }[]
  unknown: string[]
  unsent: string[]
  /** ok/already, spelled the way Google will list them, for the 同步中 overlay. */
  landed: string[]
  /** Something may have landed unconfirmed: re-read Google soon. */
  recheck: boolean
  stop: StopScope | null
  detail: string | null
}

export type JobView = {
  tone: "queued" | "running" | "success" | "failure"
  title: string
  lines: string[]
  progress: { done: number; total: number } | null
  retry: string[]
}

export function newJob(id: number, b: NewBatch): BatchJob {
  return {
    id,
    groupId: b.groupId,
    groupEmail: b.groupEmail,
    emails: b.emails,
    dispatched: 0,
    inFlight: 0,
    added: 0,
    already: 0,
    failed: [],
    unknown: [],
    unsent: [],
    stopDetail: null,
    done: false,
  }
}

export function nextChunk(job: BatchJob): string[] {
  return job.emails.slice(job.dispatched, job.dispatched + CHUNK_SIZE)
}

export function markDispatched(job: BatchJob, chunk: string[]): BatchJob {
  return {
    ...job,
    dispatched: job.dispatched + chunk.length,
    inFlight: chunk.length,
  }
}

export function stopScopeOf(reply: ChunkReply): StopScope | null {
  switch (reply.status) {
    case "ok":
      return null
    case "unconfigured":
    case "thrown":
      return "global"
    case "forbidden":
      return reply.reason === "google_permission" ? "global" : "group"
    case "error":
      return reply.detail === UNAUTHORIZED ? "global" : "group"
  }
}

function stopDetailOf(reply: ChunkReply): string | null {
  switch (reply.status) {
    case "ok":
      return null
    case "unconfigured":
      return "Google 群組整合尚未設定"
    case "thrown":
      return reply.missingAction
        ? "網站已更新，請重新整理頁面後再試"
        : "連線中斷，請重新整理頁面後再試"
    case "forbidden":
      return reply.detail
    case "error":
      return reply.detail === UNAUTHORIZED
        ? "登入已失效，請重新整理頁面後再試"
        : reply.detail
  }
}

export function classifyChunk(
  chunk: string[],
  reply: ChunkReply
): ChunkOutcome {
  const out: ChunkOutcome = {
    added: 0,
    already: 0,
    failed: [],
    unknown: [],
    unsent: [],
    landed: [],
    recheck: false,
    stop: stopScopeOf(reply),
    detail: stopDetailOf(reply),
  }
  const count = (results: MemberChangeResult[]) => {
    for (const r of results) {
      if (r.outcome === "ok") out.added++
      else if (r.outcome === "already") out.already++
      else out.failed.push({ email: r.email, detail: r.detail ?? r.outcome })
      if (r.outcome === "ok" || r.outcome === "already")
        out.landed.push(r.listedAs ?? r.email)
    }
  }

  if (reply.status === "ok") {
    count(reply.data)
    // A failed address may still have landed (a timeout says "result unknown").
    out.recheck = out.failed.length > 0
    return out
  }
  if (reply.status === "thrown") {
    if (reply.missingAction) out.unsent = [...chunk]
    else {
      out.unknown = [...chunk]
      out.recheck = true
    }
    return out
  }
  out.recheck = mayHaveLanded(reply)
  const results = "results" in reply ? reply.results : undefined
  if (results) {
    // A chunk that stopped part-way: an address with no entry was never tried.
    count(results)
    const tried = new Set(results.map((r) => r.email))
    out.unsent = chunk.filter((e) => !tried.has(e))
  } else if (out.recheck) out.unknown = [...chunk]
  else out.unsent = [...chunk]
  return out
}

export function applyOutcome(job: BatchJob, outcome: ChunkOutcome): BatchJob {
  const next: BatchJob = {
    ...job,
    inFlight: 0,
    added: job.added + outcome.added,
    already: job.already + outcome.already,
    failed: [...job.failed, ...outcome.failed],
    unknown: [...job.unknown, ...outcome.unknown],
    unsent: [...job.unsent, ...outcome.unsent],
  }
  if (outcome.stop) return stopJob(next, outcome.detail)
  return { ...next, done: next.dispatched >= next.emails.length }
}

/** End a batch: whatever was not dispatched is reported unsent. */
export function stopJob(job: BatchJob, detail: string | null): BatchJob {
  return {
    ...job,
    unsent: [...job.unsent, ...job.emails.slice(job.dispatched)],
    stopDetail: detail ?? job.stopDetail,
    done: true,
  }
}

/**
 * The batch whose next chunk goes out: each group's oldest unfinished batch
 * competes, the group served longest ago (or never) first, ties to the
 * older batch. `served` maps a group id to when it last got a chunk.
 */
export function pickNext(
  jobs: readonly BatchJob[],
  served: ReadonlyMap<string, number>
): BatchJob | null {
  const heads = new Map<string, BatchJob>()
  for (const j of jobs) {
    if (j.done) continue
    const head = heads.get(j.groupId)
    if (!head || j.id < head.id) heads.set(j.groupId, j)
  }
  let best: BatchJob | null = null
  for (const j of heads.values()) {
    if (!best) {
      best = j
      continue
    }
    const a = served.get(j.groupId) ?? -1
    const b = served.get(best.groupId) ?? -1
    if (a < b || (a === b && j.id < best.id)) best = j
  }
  return best
}

/** Addresses of this group's batches that have no result yet. */
export function waitingRows(
  jobs: readonly BatchJob[],
  groupId: string
): { email: string; sending: boolean }[] {
  return jobs
    .filter((j) => j.groupId === groupId && !j.done)
    .flatMap((j) =>
      j.emails
        .slice(j.dispatched - j.inFlight)
        .map((email, i) => ({ email, sending: i < j.inFlight }))
    )
}

function resolved(job: BatchJob): number {
  return job.added + job.already + job.failed.length + job.unknown.length
}

export function jobView(job: BatchJob, jobs: readonly BatchJob[]): JobView {
  const total = job.emails.length
  if (!job.done) {
    const queued = jobs.some(
      (j) => j.groupId === job.groupId && !j.done && j.id < job.id
    )
    if (queued)
      return {
        tone: "queued",
        title: `${job.groupEmail} 排隊中（${total} 人）`,
        lines: [],
        progress: null,
        retry: [],
      }
    const done = resolved(job)
    return {
      tone: "running",
      title: total >= 2 ? `正在加入 ${done} / ${total}` : "正在加入",
      lines: [job.groupEmail, "請先別關掉或重新整理這一頁"],
      progress: total >= 2 ? { done, total } : null,
      retry: [],
    }
  }

  const parts = [`已加入 ${job.added} 人`]
  if (job.already) parts.push(`${job.already} 人原本就在`)
  if (job.failed.length) parts.push(`失敗 ${job.failed.length} 人`)
  if (job.unknown.length) parts.push(`結果未知 ${job.unknown.length} 人`)
  if (job.unsent.length) parts.push(`未送出 ${job.unsent.length} 人`)
  const title = parts.join("，")

  const ok =
    job.failed.length === 0 &&
    job.unknown.length === 0 &&
    job.unsent.length === 0
  if (ok)
    return {
      tone: "success",
      title,
      lines: [job.groupEmail],
      progress: null,
      retry: [],
    }

  const lines = [job.groupEmail]
  if (job.stopDetail) lines.push(job.stopDetail)
  for (const f of job.failed.slice(0, LISTED_FAILURES))
    lines.push(`${f.email}（${f.detail}）`)
  if (job.failed.length > LISTED_FAILURES)
    lines.push(`另外 ${job.failed.length - LISTED_FAILURES} 個`)
  return {
    tone: "failure",
    title,
    lines,
    progress: null,
    retry: [...job.failed.map((f) => f.email), ...job.unknown, ...job.unsent],
  }
}
