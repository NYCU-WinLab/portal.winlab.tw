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

import { readEpics, type GitLabEpic } from "./epics"

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

/**
 * One epic by iid, for confirming what a booking actually points at.
 *
 * The booking path uses this rather than trusting the labels the browser sent
 * back with the form — deliverables become labels on a real epic marker, and
 * "whatever the client said the epic had" is not the same claim as "what the
 * epic has".
 */
export async function fetchEpic(
  groupPath: string,
  iid: number
): Promise<GitLabEpic | null> {
  const token = process.env.GITLAB_API_TOKEN
  if (!token) return null

  const url = `${baseUrl()}/api/v4/groups/${encodeURIComponent(groupPath)}/epics/${iid}`
  try {
    const response = await fetch(url, {
      headers: { "PRIVATE-TOKEN": token },
      cache: "no-store",
    })
    if (!response.ok) return null
    // Reuses the list reader so a single epic gets the same fail-closed
    // confidential check as one in a list.
    return readEpics([await response.json()])[0] ?? null
  } catch (err) {
    console.error("[gitlab] epic read failed", err)
    return null
  }
}
