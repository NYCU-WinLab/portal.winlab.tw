// Reading GitLab epics into the shapes the booking form needs.
//
// Split from the HTTP client so the rules that matter can be tested without a
// network: which epics a person is allowed to see, and where a meeting's
// deliverables actually come from.
//
// The epic IS the meeting — it carries no deliverables of its own. What the
// meeting owes is on the issues linked under it, so the deliverables are the
// union of those issues' `Deliverable::*` labels. Reading the epic's own
// labels instead looks almost right and is always empty.

import { DELIVERABLES, type Deliverable } from "@/lib/rooms/deliverables"

export interface GitLabEpic {
  iid: number
  title: string
  /** The epic's body. Pre-fills the meeting's agenda when one is picked. */
  description: string | null
  webUrl: string | null
}

const KNOWN_DELIVERABLES = new Set<string>(DELIVERABLES.map((d) => d.value))

/**
 * The `Deliverable::*` labels in a set of labels, in the canonical order.
 *
 * An issue carries labels Portal has no opinion about (workflow state,
 * priority, whatever the group invented last week); only the four scoped
 * deliverable labels mean anything here.
 */
export function deliverablesFromLabels(
  labels: readonly string[]
): Deliverable[] {
  const present = new Set(labels.filter((l) => KNOWN_DELIVERABLES.has(l)))
  return DELIVERABLES.map((d) => d.value).filter((v) =>
    present.has(v)
  ) as Deliverable[]
}

/** One issue under an epic, reduced to what the booking form shows. */
export interface EpicIssue {
  /**
   * Null when the issue is confidential.
   *
   * The deliverable still counts — it's one of four fixed, publicly-known
   * label values and naming it discloses nothing — but the title is the
   * issue's actual content and stays behind the same fail-closed rule the
   * epic picker uses. So a confidential issue contributes "this meeting owes
   * a 投影片" without contributing what the 投影片 is about.
   */
  title: string | null
  deliverables: Deliverable[]
}

function labelsOf(row: unknown): string[] {
  if (typeof row !== "object" || row === null) return []
  const labels = (row as { labels?: unknown }).labels
  return Array.isArray(labels)
    ? labels.filter((l): l is string => typeof l === "string")
    : []
}

/**
 * The issues under an epic that owe something, newest-first as GitLab
 * returned them.
 *
 * Issues with no `Deliverable::*` label are dropped: they're work under the
 * epic, not deliverables of the meeting.
 */
export function readEpicIssues(body: unknown): EpicIssue[] {
  if (!Array.isArray(body)) return []
  return body
    .map((row): EpicIssue | null => {
      const deliverables = deliverablesFromLabels(labelsOf(row))
      if (deliverables.length === 0) return null

      const raw = row as { title?: unknown; confidential?: unknown }
      const title =
        isPublicItem(raw) && typeof raw.title === "string" && raw.title.trim()
          ? raw.title.trim()
          : null
      return { title, deliverables }
    })
    .filter((issue): issue is EpicIssue => issue !== null)
}

/** Every deliverable an epic's issues carry, de-duplicated and canonical. */
export function deliverablesOf(issues: readonly EpicIssue[]): Deliverable[] {
  return deliverablesFromLabels(issues.flatMap((i) => i.deliverables))
}

/**
 * Whether an epic's or issue's own text may be shown.
 *
 * Fail-closed, and deliberately not "exclude the ones marked true": the token
 * this is read with can see confidential epics, and confidential is also the
 * channel the deliverables bot is triggered on — so a title leaking into a
 * dropdown is a real disclosure, not a cosmetic bug. A response that omits the
 * field, renames it, or sends something other than a boolean `false` is
 * treated as confidential. The cost of being wrong in this direction is a
 * shorter list; the other direction has no floor.
 */
export function isPublicItem(raw: { confidential?: unknown }): boolean {
  return raw.confidential === false
}

interface RawEpic {
  iid?: unknown
  title?: unknown
  description?: unknown
  web_url?: unknown
  confidential?: unknown
}

/**
 * Reads one epic from the API response, or null if it can't be shown.
 *
 * Returns null rather than throwing on a malformed row: one odd epic in a
 * group shouldn't take the whole picker down with it.
 */
export function readEpic(raw: RawEpic): GitLabEpic | null {
  if (!isPublicItem(raw)) return null

  const iid = typeof raw.iid === "number" ? raw.iid : Number(raw.iid)
  if (!Number.isInteger(iid) || iid <= 0) return null

  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  if (!title) return null

  return {
    iid,
    title,
    description:
      typeof raw.description === "string" && raw.description.trim()
        ? raw.description
        : null,
    webUrl: typeof raw.web_url === "string" ? raw.web_url : null,
  }
}

export function readEpics(body: unknown): GitLabEpic[] {
  if (!Array.isArray(body)) return []
  return body
    .map((row) => (typeof row === "object" && row ? readEpic(row) : null))
    .filter((e): e is GitLabEpic => e !== null)
}
