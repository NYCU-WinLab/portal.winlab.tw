// Reads /lab-member/* membership so the portal can tell an active member from
// a graduate. Read-only — the service account holds view-users and nothing
// more (see lib/keycloak/admin.ts).
//
// PULL, not push. The obvious-looking alternative is to mirror the status into
// user_profiles on login, the way sync_user_profile_username does for the
// username. It does not work: the moment that matters is someone moving to
// /lab-member/alumni, and a person who has graduated never signs in again — so
// a login-time trigger would leave every alumnus frozen at their pre-graduation
// status forever. Only a sweep sees the change.

import {
  adminRealmUrl,
  adminToken,
  errorDetail,
  keycloakEnv,
  KeycloakAdminError,
} from "@/lib/keycloak/admin"
import {
  labStatusFromGroupPath,
  type LabStatus,
} from "@/lib/meetings/lab-status"

export type LabStatusFetchResult =
  | { status: "ok"; byUsername: Map<string, LabStatus> }
  | { status: "unconfigured" }
  | { status: "forbidden"; detail: string }
  | { status: "error"; detail: string }

type RawGroup = { id: string; name: string; path: string }
type RawMember = { username?: string }

// Keycloak's members endpoint has no cursor and no total header — page on
// first/max and stop when a page comes back short. Same shape as scripts/kc.
const PAGE = 100

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new KeycloakAdminError("get", res.status, await errorDetail(res))
  }
  return (await res.json()) as T
}

export async function fetchLabStatuses(): Promise<LabStatusFetchResult> {
  const env = keycloakEnv()
  if (!env) return { status: "unconfigured" }

  try {
    const token = await adminToken(env)
    const base = adminRealmUrl(env)

    const roots = await getJson<RawGroup[]>(`${base}/groups?max=200`, token)
    const labMember = roots.find((g) => g.path === "/lab-member")
    // A realm with no /lab-member group is a misconfiguration, not an empty
    // lab. Reporting it beats writing null over everyone's status.
    if (!labMember) {
      return { status: "error", detail: "no /lab-member group in realm" }
    }

    const children = await getJson<RawGroup[]>(
      `${base}/groups/${labMember.id}/children?max=100`,
      token
    )

    const byUsername = new Map<string, LabStatus>()
    for (const child of children) {
      const status = labStatusFromGroupPath(child.path)
      if (!status) continue
      for (let first = 0; ; first += PAGE) {
        const page = await getJson<RawMember[]>(
          `${base}/groups/${child.id}/members?first=${first}&max=${PAGE}`,
          token
        )
        for (const member of page) {
          if (member.username) byUsername.set(member.username, status)
        }
        if (page.length < PAGE) break
      }
    }

    // Zero statuses is indistinguishable, downstream, from a silent
    // catastrophe: an empty `/lab-member` children list, or every child
    // mapping to something other than a known LabStatus, both produce the
    // same empty map as a transport failure would — and planLabStatusUpdates
    // reads an empty map as "Keycloak knows nobody", nulling out lab_status
    // for every profile with a username in one sweep. Refuse it here rather
    // than let the route's ok-branch apply it.
    if (byUsername.size === 0) {
      return {
        status: "error",
        detail:
          "no lab-member statuses found across any /lab-member child group",
      }
    }

    return { status: "ok", byUsername }
  } catch (err) {
    if (err instanceof KeycloakAdminError) {
      if (err.status === 403) {
        return { status: "forbidden", detail: err.message }
      }
      return { status: "error", detail: err.message }
    }
    return { status: "error", detail: String(err) }
  }
}
