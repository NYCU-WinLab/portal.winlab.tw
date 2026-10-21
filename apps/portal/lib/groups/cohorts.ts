// The /lab-member/<民國年> cohort groups and their members, for the /groups
// "add by cohort" picker — and nothing else from Keycloak.
// lib/rooms/keycloak-groups.ts's fetchAttendeeGroups() would also serve, but
// it walks every subgroup in the realm and reads all of their members, on
// every render of a group page. Read-only, through the same view-users
// credential (lib/keycloak/admin.ts).

import "server-only"

import {
  adminRealmUrl,
  adminToken,
  errorDetail,
  keycloakEnv,
  KeycloakAdminError,
} from "@/lib/keycloak/admin"
import { isCohortGroupPath } from "@/lib/meetings/lab-status"
import type { KeycloakGroupMember } from "@/lib/rooms/keycloak-groups"

export type Cohort = { name: string; members: KeycloakGroupMember[] }

type RawGroup = { id: string; name: string; path: string }
type RawMember = {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  username?: string
}

// The members endpoint has no cursor; page on first/max until a short page.
const PAGE = 100

/** The whole lookup, token included, gets this long; then the picker is hidden. */
export const COHORT_DEADLINE_MS = 8_000

async function getJson<T>(
  url: string,
  token: string,
  signal: AbortSignal
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  })
  if (!res.ok)
    throw new KeycloakAdminError("get", res.status, await errorDetail(res))
  return (await res.json()) as T
}

async function cohortMembers(
  base: string,
  groupId: string,
  token: string,
  signal: AbortSignal
): Promise<KeycloakGroupMember[]> {
  const out: KeycloakGroupMember[] = []
  for (let first = 0; ; first += PAGE) {
    // briefRepresentation=false is what puts `email` on each member.
    const page = await getJson<RawMember[]>(
      `${base}/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=false&first=${first}&max=${PAGE}`,
      token,
      signal
    )
    for (const m of page) {
      const name = [m.firstName, m.lastName].filter(Boolean).join(" ")
      out.push({
        id: m.id,
        email: m.email ?? null,
        name: name || m.username || m.email || null,
        username: m.username ?? null,
      })
    }
    if (page.length < PAGE) return out
  }
}

/**
 * Newest cohort first. null when Keycloak isn't set up or can't be read in
 * `deadlineMs`: the page then hides the cohort picker, and everything else
 * still works. The deadline covers the token exchange too; this module's own
 * requests are aborted, and the token request (shared code) is just raced.
 */
export async function fetchCohorts(
  deadlineMs = COHORT_DEADLINE_MS
): Promise<Cohort[] | null> {
  const env = keycloakEnv()
  if (!env) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), deadlineMs)
  const expired = new Promise<never>((_, reject) =>
    ctl.signal.addEventListener(
      "abort",
      () =>
        reject(new Error(`keycloak cohort read timed out (${deadlineMs} ms)`)),
      { once: true }
    )
  )
  const read = readCohorts(env, ctl.signal)
  // If the deadline wins, the read is abandoned; keep its late failure quiet.
  read.catch(() => {})
  try {
    return await Promise.race([read, expired])
  } catch (err) {
    console.error("[groups] keycloak cohort read failed", err)
    return null
  } finally {
    clearTimeout(timer)
    // Settles `expired` for good if it never fired; nothing awaits it.
    expired.catch(() => {})
  }
}

async function readCohorts(
  env: NonNullable<ReturnType<typeof keycloakEnv>>,
  signal: AbortSignal
): Promise<Cohort[] | null> {
  const token = await adminToken(env)
  const base = adminRealmUrl(env)
  const roots = await getJson<RawGroup[]>(
    `${base}/groups?max=200`,
    token,
    signal
  )
  const labMember = roots.find((g) => g.path === "/lab-member")
  if (!labMember) return null
  const children = await getJson<RawGroup[]>(
    `${base}/groups/${encodeURIComponent(labMember.id)}/children?max=100`,
    token,
    signal
  )
  const cohorts = await Promise.all(
    children
      .filter((c) => isCohortGroupPath(c.path))
      .map(async (c) => ({
        name: c.name,
        members: await cohortMembers(base, c.id, token, signal),
      }))
  )
  return cohorts.sort((a, b) => b.name.localeCompare(a.name))
}
