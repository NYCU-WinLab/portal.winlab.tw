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
  findUnrecognisedGroupPaths,
  labStatusFromGroupPath,
  type LabStatus,
} from "@/lib/meetings/lab-status"

export type LabStatusFetchResult =
  | {
      status: "ok"
      byUsername: Map<string, LabStatus>
      // Members returned by a group's members endpoint with no `username`.
      // Indistinguishable, downstream, from a departure — surfaced so a
      // non-zero rate is visible in the cron's response rather than silent.
      skippedNoUsername: number
    }
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

    // An unrecognised child is not something to skip past: the realm was
    // already restructured once (a subgroup rename, 2026-08-11), and mapping
    // one to null here would silently drop everyone in it from the sync —
    // indistinguishable, downstream, from those people leaving. Refuse the
    // whole read and name the offender rather than write a partial map.
    const unrecognised = findUnrecognisedGroupPaths(children.map((c) => c.path))
    if (unrecognised.length > 0) {
      return {
        status: "error",
        detail: `unrecognised /lab-member child group(s): ${unrecognised.join(", ")}`,
      }
    }

    const byUsername = new Map<string, LabStatus>()
    let skippedNoUsername = 0
    for (const child of children) {
      const status = labStatusFromGroupPath(child.path)
      // Unreachable after the check above — every child path here is a known
      // LabStatus — but the type is still `LabStatus | null`, so keep the
      // guard rather than assert past it.
      if (!status) continue
      for (let first = 0; ; first += PAGE) {
        const page = await getJson<RawMember[]>(
          `${base}/groups/${child.id}/members?first=${first}&max=${PAGE}`,
          token
        )
        for (const member of page) {
          if (member.username) byUsername.set(member.username, status)
          else skippedNoUsername++
        }
        if (page.length < PAGE) break
      }
    }

    // A single group's members endpoint returning empty (or every group
    // being empty) is no longer refused here: a legitimately small group can
    // hit zero, and refusing the whole sync on that would stop lab_status
    // updating for everyone indefinitely. The blast-radius guard on the
    // resulting update PLAN (checkLabStatusUpdatePlan, called from the cron
    // route) catches the harmful case — a sweep that would mass-null
    // lab_status — without needing to guess which underlying cause produced
    // it.
    return { status: "ok", byUsername, skippedNoUsername }
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
