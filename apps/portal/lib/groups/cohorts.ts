// The /lab-member/<民國年> cohort groups and their members, for the /groups
// "add by cohort" picker — and nothing else from Keycloak.
// lib/rooms/keycloak-groups.ts's fetchAttendeeGroups() would also serve, but
// it walks every subgroup in the realm and reads all of their members, on
// every render of a group page. Read-only, through the same view-users
// credential (lib/keycloak/admin.ts).

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

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok)
    throw new KeycloakAdminError("get", res.status, await errorDetail(res))
  return (await res.json()) as T
}

async function cohortMembers(
  base: string,
  groupId: string,
  token: string
): Promise<KeycloakGroupMember[]> {
  const out: KeycloakGroupMember[] = []
  for (let first = 0; ; first += PAGE) {
    // briefRepresentation=false is what puts `email` on each member.
    const page = await getJson<RawMember[]>(
      `${base}/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=false&first=${first}&max=${PAGE}`,
      token
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
 * Newest cohort first. null when Keycloak isn't set up or can't be read:
 * the page then hides the cohort picker, and everything else still works.
 */
export async function fetchCohorts(): Promise<Cohort[] | null> {
  const env = keycloakEnv()
  if (!env) return null
  try {
    const token = await adminToken(env)
    const base = adminRealmUrl(env)
    const roots = await getJson<RawGroup[]>(`${base}/groups?max=200`, token)
    const labMember = roots.find((g) => g.path === "/lab-member")
    if (!labMember) return null
    const children = await getJson<RawGroup[]>(
      `${base}/groups/${encodeURIComponent(labMember.id)}/children?max=100`,
      token
    )
    const cohorts = await Promise.all(
      children
        .filter((c) => isCohortGroupPath(c.path))
        .map(async (c) => ({
          name: c.name,
          members: await cohortMembers(base, c.id, token),
        }))
    )
    return cohorts.sort((a, b) => b.name.localeCompare(a.name))
  } catch (err) {
    console.error("[groups] keycloak cohort read failed", err)
    return null
  }
}
