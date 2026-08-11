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
//
// Nothing here filters on `confidential`, and that is deliberate rather than
// an oversight. An earlier version dropped confidential epics from the picker
// and blanked confidential issue titles, on the reading that the flag marked
// NDA material. N0Ball corrected it: in this lab `confidential` is the
// deliverables bot's trigger channel, not a secrecy marker, so filtering on it
// hid ordinary work from the people whose meeting it is. Everything here is
// already behind Portal's login and reaches lab members only.

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
  /** Null only when GitLab sent no usable title, never for confidentiality. */
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

      const raw = row as { title?: unknown }
      const title =
        typeof raw.title === "string" && raw.title.trim()
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

interface RawEpic {
  iid?: unknown
  title?: unknown
  description?: unknown
  web_url?: unknown
}

/**
 * Reads one epic from the API response, or null if it can't be shown.
 *
 * Returns null rather than throwing on a malformed row: one odd epic in a
 * group shouldn't take the whole picker down with it.
 */
export function readEpic(raw: RawEpic): GitLabEpic | null {
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
