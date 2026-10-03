// What a booking's chosen epics resolve to, with GitLab injected.
//
// The decisions live here, away from `server-only` and the network, so they
// can be tested: which references are acceptable, what a missing epic says
// versus an unreachable GitLab, and what a recurring series may reuse.
// lib/rooms/confirm.ts wires in the real GitLab client.

import type { EpicDeliverablesResult } from "@/lib/gitlab/client"
import type { EpicRead, GitLabEpic } from "@/lib/gitlab/epics"
import { sanitizeDeliverables } from "@/lib/rooms/deliverables"
import { parseEpicRef, type EpicRef } from "@/lib/rooms/epic-refs"

export interface EpicLinkFetchers {
  fetchEpic: (groupPath: string, iid: number) => Promise<EpicRead>
  fetchEpicDeliverables: (
    groupPath: string,
    epic: GitLabEpic
  ) => Promise<EpicDeliverablesResult>
}

export interface EpicLink {
  issueRefs: string[]
  deliverables: string[]
}

function refKey(ref: EpicRef): string {
  return `${ref.groupPath}&${ref.iid}`
}

/** Why an epic couldn't be read, in words a person booking a room can act on. */
export function epicReadFailure(
  ref: EpicRef,
  read: Extract<EpicRead, { ok: false }>
): string {
  if (read.reason === "not_found") return `所選 Epic 已不存在（${refKey(ref)}）`
  const why = read.status !== undefined ? `HTTP ${read.status}` : read.detail
  return `GitLab 目前無法讀取 Epic（${why}），請稍後再試`
}

/**
 * Resolves a booking's requested epic references against GitLab.
 *
 * @param groupPath the GitLab path of the group being booked under, already
 *   resolved server-side; null when the group has none.
 * @throws with a user-facing message on any reference that can't be used.
 */
export async function decideEpicLink(
  groupPath: string | null,
  requested: readonly string[],
  recurring: boolean,
  fetchers: EpicLinkFetchers
): Promise<EpicLink> {
  if (requested.length === 0) return { issueRefs: [], deliverables: [] }

  if (!groupPath) {
    throw new Error("所選群組沒有設定 gitlab_path，無法確認 Epic")
  }

  const parsed = requested
    .map((raw) => parseEpicRef(raw, groupPath))
    .filter((ref) => ref !== null)
    .filter((ref) => ref.groupPath === groupPath)

  if (parsed.length !== requested.length) {
    throw new Error("Epic reference 無效或不屬於所選群組")
  }

  // `&4` and a full URL to epic 4 are the same epic; storing both would send
  // the pipeline two marker comments for one meeting.
  const refs = [...new Map(parsed.map((ref) => [refKey(ref), ref])).values()]

  const reads = await Promise.all(
    refs.map((ref) => fetchers.fetchEpic(groupPath, ref.iid))
  )
  const epics: GitLabEpic[] = []
  for (const [i, read] of reads.entries()) {
    if (!read.ok) throw new Error(epicReadFailure(refs[i]!, read))
    epics.push(read.epic)
  }

  if (recurring && epics.some((epic) => epic.classification !== "sync")) {
    throw new Error(
      "固定群組會議只能選 Sync container；Report 與單場 Meeting 不能重複使用"
    )
  }

  const deliverables = await Promise.all(
    epics.map((epic) => fetchers.fetchEpicDeliverables(groupPath, epic))
  )
  const failed = deliverables.find((result) => result.status === "error")
  if (failed?.status === "error") {
    throw new Error(`無法確認所選 Epic:${failed.detail}`)
  }

  return {
    issueRefs: epics.map((epic) => `${groupPath}&${epic.iid}`),
    // Re-normalised rather than concatenated: two epics can each be in
    // canonical order and still interleave when joined.
    deliverables: sanitizeDeliverables(
      deliverables.flatMap((d) => (d.status === "ok" ? d.deliverables : []))
    ),
  }
}
