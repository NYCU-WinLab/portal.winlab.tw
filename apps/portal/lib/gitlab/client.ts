// Read-only GitLab access, server-side only.
//
// `GITLAB_API_TOKEN` is a `read_api` token with no `NEXT_PUBLIC_` prefix, and
// it must stay that way: it can read confidential epics, which are also the
// deliverables bot's trigger channel. Nothing in this file is importable from
// a client component — the booking form reaches it through a server action.
//
// This is the only direction the integration runs in. Portal reads GitLab;
// GitLab writes GitLab. See the Portal/GitLab boundary in CLAUDE.md.

import "server-only"

import { deliverablesFromIssues, readEpics, type GitLabEpic } from "./epics"
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

  const url =
    `${baseUrl()}/api/v4/groups/${encodeURIComponent(path)}/epics` +
    `?state=opened&order_by=updated_at&sort=desc&per_page=${EPIC_PAGE_SIZE}`

  try {
    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": token },
      cache: "no-store",
    })
    if (!response.ok) {
      const body = await response.text().catch(() => "")
      return {
        status: "error",
        detail: `GitLab 回應 ${response.status}${body ? `:${body.slice(0, 200)}` : ""}`,
      }
    }
    return { status: "ok", epics: readEpics(await response.json()) }
  } catch (err) {
    // Logged as well as returned: a picker that quietly shows nothing is
    // indistinguishable from a group with no open epics.
    console.error("[gitlab] epic read failed", err)
    return {
      status: "error",
      detail: err instanceof Error ? err.message : "unknown",
    }
  }
}

type Read = { ok: true; body: unknown } | { ok: false; detail: string }

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
      return { ok: false, detail }
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
  // Reuses the list reader so a single epic gets the same fail-closed
  // confidential check as one in a list.
  return readEpics([read.body])[0] ?? null
}

export type EpicDeliverablesResult =
  | {
      status: "ok"
      deliverables: Deliverable[]
      /**
       * How many issues GitLab returned. Zero with `status: "ok"` says the
       * epic has no child issues at all, which is a different fix from
       * "it has issues and none of them are labelled".
       */
      issueCount: number
    }
  | { status: "error"; detail: string }

/**
 * What a meeting owes, from the issues under its epic.
 *
 * The epic is the meeting and carries no deliverables of its own — they live
 * on the issues underneath it, which is why this is a second round trip
 * rather than a field on the epic.
 *
 * Reads the epic-issue association (`/epics/:iid/issues`), i.e. what the UI
 * shows as the epic's child items. Issues merely *linked* to the epic as
 * related items are a different association and do not appear here.
 */
export async function fetchEpicDeliverables(
  groupPath: string,
  iid: number
): Promise<EpicDeliverablesResult> {
  const read = await getJson(
    `/groups/${encodeURIComponent(groupPath)}/epics/${iid}/issues?per_page=100`
  )
  if (!read.ok) return { status: "error", detail: read.detail }

  return {
    status: "ok",
    deliverables: deliverablesFromIssues(read.body),
    issueCount: Array.isArray(read.body) ? read.body.length : 0,
  }
}
