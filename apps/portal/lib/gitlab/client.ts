// Read-only GitLab access, server-side only.
//
// `GITLAB_API_TOKEN` is a `read_api` token with no `NEXT_PUBLIC_` prefix, and
// it must stay that way — it reads every group the lab has. Nothing in this
// file is importable from a client component; the booking form reaches it
// through a server action.
//
// This is the only direction the integration runs in. Portal reads GitLab;
// GitLab writes GitLab. See the Portal/GitLab boundary in CLAUDE.md.

import "server-only"

import {
  deliverablesOf,
  epicIssuesPath,
  groupIterationsPath,
  reportIssuesQuery,
  readEpicIssues,
  readEpics,
  readReviewIssues,
  type EpicIssue,
  type GitLabEpic,
} from "./epics"
import type { Deliverable } from "@/lib/rooms/deliverables"

const DEFAULT_BASE_URL = "https://gitlab.winlab.tw"

/** How many open epics a group's picker will show. */
const EPIC_PAGE_SIZE = 100

export type EpicsResult =
  | { status: "ok"; epics: GitLabEpic[] }
  /** No token configured — the picker says so rather than showing nothing. */
  | { status: "unconfigured" }
  /** The Keycloak group carries no `gitlab_path`, so there's nothing to read. */
  | { status: "unlinked" }
  | { status: "error"; detail: string }

export function gitlabConfigured(): boolean {
  return !!process.env.GITLAB_API_TOKEN
}

function baseUrl(): string {
  return (process.env.GITLAB_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
}

/**
 * The open epics of one group, ready for the picker.
 *
 * @param groupPath the full GitLab group path, resolved server-side from the
 *   Keycloak group's `gitlab_path` attribute. Never taken from the browser: a
 *   caller-supplied path would turn this into a way to read any group the
 *   token can see.
 */
export async function fetchOpenEpics(
  groupPath: string | null | undefined
): Promise<EpicsResult> {
  const token = process.env.GITLAB_API_TOKEN
  if (!token) return { status: "unconfigured" }

  const path = groupPath?.trim()
  if (!path) return { status: "unlinked" }

  const read = await getAllPages(
    (page) =>
      `/groups/${encodeURIComponent(path)}/epics` +
      `?state=opened&order_by=updated_at&sort=desc&per_page=${EPIC_PAGE_SIZE}&page=${page}`
  )
  if (!read.ok) return { status: "error", detail: read.detail }
  return { status: "ok", epics: readEpics(read.body) }
}

type Read =
  | { ok: true; body: unknown }
  | { ok: false; detail: string; status?: number }

/**
 * One authenticated GET, reporting why it failed rather than just that it did.
 *
 * The distinction earns its keep: a 403 from a token that can't see the
 * project, a 404 from a wrong path, and a genuinely empty list are three
 * different problems, and collapsing them into `null` is what made the first
 * report of this unreadable.
 */
async function getJson(path: string): Promise<Read> {
  const token = process.env.GITLAB_API_TOKEN
  if (!token) return { ok: false, detail: "GITLAB_API_TOKEN 未設定" }

  try {
    const response = await fetch(`${baseUrl()}/api/v4${path}`, {
      headers: { "PRIVATE-TOKEN": token },
      cache: "no-store",
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      const detail = `GitLab 回應 ${response.status}${body ? `:${body.slice(0, 200)}` : ""}`
      console.error("[gitlab] read failed", path, detail)
      return { ok: false, detail, status: response.status }
    }
    return { ok: true, body: await response.json() }
  } catch (err) {
    console.error("[gitlab] read failed", path, err)
    return { ok: false, detail: err instanceof Error ? err.message : "unknown" }
  }
}

/**
 * One epic by iid, for confirming what a booking actually points at.
 *
 * The booking path resolves the epic itself rather than trusting what the
 * browser sent back with the form: the reference decides which epic a marker
 * comment lands on, and "the client said epic 4" is not the same claim as
 * "epic 4 exists and is readable".
 */
export async function fetchEpic(
  groupPath: string,
  iid: number
): Promise<GitLabEpic | null> {
  const read = await getJson(
    `/groups/${encodeURIComponent(groupPath)}/epics/${iid}`
  )
  if (!read.ok) return null
  // Reuses the list reader so a single epic is validated the same way as one
  // that arrived in a list.
  return readEpics([read.body])[0] ?? null
}

export type EpicDeliverablesResult =
  | {
      status: "ok"
      classification: GitLabEpic["classification"]
      reviewIterationId?: number
      /** The union, for storing and forwarding to the pipeline. */
      deliverables: Deliverable[]
      /** Per-issue, for showing a person which issue owes which thing. */
      issues: EpicIssue[]
      /**
       * How many issues GitLab returned, labelled or not. Zero with
       * `status: "ok"` says the epic has no child issues at all, which is a
       * different fix from "it has issues and none of them are labelled".
       */
      issueCount: number
    }
  | { status: "error"; detail: string }

const ISSUE_PAGE_SIZE = 100

async function getAllPages(
  pathForPage: (page: number) => string
): Promise<Read> {
  const rows: unknown[] = []
  for (let page = 1; ; page++) {
    const read = await getJson(pathForPage(page))
    if (!read.ok) return read
    if (!Array.isArray(read.body)) {
      return { ok: false, detail: "GitLab 回應不是清單" }
    }
    rows.push(...read.body)
    if (read.body.length < ISSUE_PAGE_SIZE) return { ok: true, body: rows }
  }
}

function property(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, key)
    : undefined
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function validateReviewIteration(
  groupPath: string,
  iterationId: number
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const read = await getAllPages((page) =>
    groupIterationsPath(groupPath, page, ISSUE_PAGE_SIZE)
  )
  if (!read.ok) return read
  if (
    Array.isArray(read.body) &&
    read.body.some(
      (iteration) => positiveInteger(property(iteration, "id")) === iterationId
    )
  ) {
    return { ok: true }
  }
  return {
    ok: false,
    detail: `Iteration #${iterationId} 不屬於所選群組或其上層群組`,
  }
}

/**
 * What a selected meeting record or Sync container means for this booking.
 *
 * Ordinary meetings read their associated issues by group-scoped iid. Reports
 * read their explicit iteration in the selected group and descendants. Sync
 * containers owe nothing themselves; the helper creates a child per booking.
 *
 * Reads the epic-issue association (`/epics/:iid/issues`), i.e. what the UI
 * shows as the epic's child items. Issues merely *linked* to the epic as
 * related items are a different association and do not appear here.
 */
export async function fetchEpicDeliverables(
  groupPath: string,
  epic: GitLabEpic
): Promise<EpicDeliverablesResult> {
  if (epic.classification === "sync") {
    return {
      status: "ok",
      classification: "sync",
      deliverables: [],
      issues: [],
      issueCount: 0,
    }
  }

  if (epic.classification === "report") {
    const iterationId = epic.reviewIterationId
    if (iterationId === undefined) {
      return {
        status: "error",
        detail: epic.reviewMarkerError ?? "Report epic 缺少明確 iteration",
      }
    }

    const validation = await validateReviewIteration(groupPath, iterationId)
    if (!validation.ok) return { status: "error", detail: validation.detail }

    const group = encodeURIComponent(groupPath)
    const read = await getAllPages(
      (page) =>
        `/groups/${group}/issues?${reportIssuesQuery(
          iterationId,
          page,
          ISSUE_PAGE_SIZE
        )}`
    )
    if (!read.ok) return { status: "error", detail: read.detail }

    const issues = readReviewIssues(read.body)
    return {
      status: "ok",
      classification: epic.classification,
      reviewIterationId: iterationId,
      deliverables: deliverablesOf(issues),
      issues,
      issueCount: issues.length,
    }
  }

  const read = await getAllPages((page) =>
    epicIssuesPath(groupPath, epic.iid, page, ISSUE_PAGE_SIZE)
  )
  if (!read.ok) return { status: "error", detail: read.detail }

  const issues = readEpicIssues(read.body)
  return {
    status: "ok",
    classification: epic.classification,
    deliverables: deliverablesOf(issues),
    issues,
    issueCount: Array.isArray(read.body) ? read.body.length : 0,
  }
}
