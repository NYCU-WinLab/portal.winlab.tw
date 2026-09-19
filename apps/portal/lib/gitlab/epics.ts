// Reading GitLab epics into the shapes the booking form needs.
//
// Split from the HTTP client so the rules that matter can be tested without a
// network: which epics a person is allowed to see, and where a meeting's
// deliverables actually come from.
//
// Meeting::Track distinguishes one meeting record from a Sync workstream
// container. A Report is a tracked record with an explicit iteration marker.
// Deliverables still come from issues, never from labels on the epic itself.
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
  /** GitLab's global id; the Epic Issues endpoint uses iid instead. */
  id: number
  iid: number
  title: string
  /** The epic's body. Only ordinary single meetings may pre-fill an agenda. */
  description: string | null
  webUrl: string | null
  classification: EpicClassification
  /** Present only for a Report epic with a valid review marker. */
  reviewIterationId?: number
  /** Present when a Report marker exists but cannot identify an iteration. */
  reviewMarkerError?: string
}

export type EpicClassification = "sync" | "report" | "meeting"

const KNOWN_DELIVERABLES = new Set<string>(DELIVERABLES.map((d) => d.value))
const MEETING_TRACK_LABEL = "Meeting::Track"
const REVIEW_MARKER = /<!--\s*winlab:review(?=\s|-->)([^>]*)-->/g
const REVIEW_ITERATION = /\biteration\s*=\s*"([^"]*)"/g

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
  webUrl: string | null
  deliverables: Deliverable[]
}

function labelsOf(row: unknown): string[] {
  const labels = property(row, "labels")
  return Array.isArray(labels)
    ? labels.filter((l): l is string => typeof l === "string")
    : []
}

function property(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined
}

/**
 * The issues under an epic that owe something, newest-first as GitLab
 * returned them.
 *
 * Issues with no `Deliverable::*` label are dropped: they're work under the
 * epic, not deliverables of the meeting.
 */
export function readEpicIssues(body: unknown): EpicIssue[] {
  return readIssues(body, false)
}

/** All issues in a Report iteration, including work with no deliverable label. */
export function readReviewIssues(body: unknown): EpicIssue[] {
  return readIssues(body, true)
}

function readIssues(body: unknown, includeAll: boolean): EpicIssue[] {
  if (!Array.isArray(body)) return []
  return body
    .map((row): EpicIssue | null => {
      if (typeof row !== "object" || row === null) return null
      const deliverables = deliverablesFromLabels(labelsOf(row))
      if (!includeAll && deliverables.length === 0) return null

      const rawTitle = property(row, "title")
      const rawWebUrl = property(row, "web_url")
      const title =
        typeof rawTitle === "string" && rawTitle.trim() ? rawTitle.trim() : null
      return {
        title,
        webUrl: typeof rawWebUrl === "string" ? rawWebUrl : null,
        deliverables,
      }
    })
    .filter((issue): issue is EpicIssue => issue !== null)
}

/** Every deliverable an epic's issues carry, de-duplicated and canonical. */
export function deliverablesOf(issues: readonly EpicIssue[]): Deliverable[] {
  return deliverablesFromLabels(issues.flatMap((i) => i.deliverables))
}

interface RawEpic {
  id?: unknown
  iid?: unknown
  title?: unknown
  description?: unknown
  web_url?: unknown
  labels?: unknown
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function classifyEpic(
  labels: readonly string[],
  description: string | null
): Pick<
  GitLabEpic,
  "classification" | "reviewIterationId" | "reviewMarkerError"
> {
  if (!labels.includes(MEETING_TRACK_LABEL)) {
    return { classification: "sync" }
  }

  const markers = [...(description ?? "").matchAll(REVIEW_MARKER)]
  if (markers.length === 0) return { classification: "meeting" }
  if (markers.length !== 1) {
    return {
      classification: "report",
      reviewMarkerError: "Report 必須只有一個 iteration marker",
    }
  }

  const iterations = [...(markers[0]?.[1] ?? "").matchAll(REVIEW_ITERATION)]
  const rawIteration = iterations.length === 1 ? iterations[0]?.[1] : undefined
  const reviewIterationId =
    rawIteration && /^[1-9]\d*$/.test(rawIteration)
      ? positiveInteger(rawIteration)
      : null
  if (reviewIterationId === null) {
    return {
      classification: "report",
      reviewMarkerError:
        'Report marker 必須包含正整數 iteration，例如 iteration="10"',
    }
  }
  return { classification: "report", reviewIterationId }
}

/**
 * Reads one epic from the API response, or null if it can't be shown.
 *
 * Returns null rather than throwing on a malformed row: one odd epic in a
 * group shouldn't take the whole picker down with it.
 */
export function readEpic(raw: RawEpic): GitLabEpic | null {
  const id = positiveInteger(raw.id)
  const iid = positiveInteger(raw.iid)
  if (id === null || iid === null) return null

  const title = typeof raw.title === "string" ? raw.title.trim() : ""
  if (!title) return null

  const description =
    typeof raw.description === "string" && raw.description.trim()
      ? raw.description
      : null

  return {
    id,
    iid,
    title,
    description,
    webUrl: typeof raw.web_url === "string" ? raw.web_url : null,
    ...classifyEpic(labelsOf(raw), description),
  }
}

export function readEpics(body: unknown): GitLabEpic[] {
  if (!Array.isArray(body)) return []
  return body
    .map((row) => (typeof row === "object" && row ? readEpic(row) : null))
    .filter((e): e is GitLabEpic => e !== null)
}

/**
 * Applies the only safe description pre-fill.
 *
 * Sync descriptions administer a whole workstream and Report descriptions
 * contain the review marker/snapshot; neither describes this one booking.
 */
export function agendaAfterEpicSelection(
  currentAgenda: string,
  epic: GitLabEpic | null,
  previousEpic: GitLabEpic | null = null
): string {
  const inherited =
    previousEpic?.classification === "meeting" &&
    currentAgenda === previousEpic.description
  if (
    (currentAgenda.trim() && !inherited) ||
    epic?.classification !== "meeting"
  ) {
    if (inherited) return ""
    return currentAgenda
  }
  return epic.description ?? (inherited ? "" : currentAgenda)
}

/** Query for a Report review, scoped to the selected group and descendants. */
export function reportIssuesQuery(
  iterationId: number,
  page: number,
  perPage = 100
): string {
  const params = new URLSearchParams({
    iteration_id: String(iterationId),
    include_subgroups: "true",
    scope: "all",
    state: "all",
    per_page: String(perPage),
    page: String(page),
  })
  return params.toString()
}

/** Epic Issues uses the group-scoped iid, unlike the legacy Epic Notes API. */
export function epicIssuesPath(
  groupPath: string,
  epicIid: number,
  page: number,
  perPage = 100
): string {
  return `/groups/${encodeURIComponent(groupPath)}/epics/${epicIid}/issues?per_page=${perPage}&page=${page}`
}

/** Lists the selected group's iterations plus ancestors for id validation. */
export function groupIterationsPath(
  groupPath: string,
  page: number,
  perPage = 100
): string {
  return `/groups/${encodeURIComponent(groupPath)}/iterations?include_ancestors=true&state=all&per_page=${perPage}&page=${page}`
}
