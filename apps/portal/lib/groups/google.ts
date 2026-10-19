// Admin SDK Directory API, the slice /groups needs. The caller injects fetch
// and a token source (lib/groups/google-auth.ts), which keeps this file free
// of credentials and testable with a fake fetch.
//
// The service account holds a custom admin role (GROUPS_RETRIEVE +
// GROUPS_UPDATE) over every group in the domain. Which groups the portal may
// touch is decided by lib/groups/scope.ts, not by Google; everything here
// only ever creates or deletes MEMBER rows — see isPlainMember.
//
// Two things Google taught us the hard way (2026-10-19):
//   * As a service account, `customer=my_customer` is a 400; ask by domain.
//   * Looking a member up by email is unreliable: GET members/{email} 404s
//     for some outside addresses that are on the list, and hasMember 400s.
//     So removal lists the members, matches the address itself, and deletes
//     by the member's id.

import { isPlainMember } from "@/lib/groups/plan"
import type { GroupMember, ManagedGroup } from "@/lib/groups/types"

const BASE = "https://admin.googleapis.com/admin/directory/v1"
const PAGE_SIZE = "200"

export type GroupsApi = {
  fetch: typeof fetch
  token: () => Promise<string>
  /** The Workspace domain, e.g. "winlab.tw". */
  domain: string
}

/** Google answered with a status this module does not treat as an outcome. */
export class GoogleGroupsError extends Error {
  constructor(
    readonly status: number,
    readonly detail?: string
  ) {
    super(`google groups failed: ${status}${detail ? ` — ${detail}` : ""}`)
    this.name = "GoogleGroupsError"
  }
}

/** No Google access token could be had (WIF, STS or impersonation failed). */
export class GroupsCredentialError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GroupsCredentialError"
  }
}

type RawGroup = { id?: string; email?: string; name?: string }
type RawMember = {
  id?: string
  email?: string
  role?: string
  type?: string
  status?: string
}

async function call(
  api: GroupsApi,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return api.fetch(`${BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await api.token()}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  })
}

async function fail(res: Response): Promise<never> {
  let detail: string | undefined
  try {
    const text = await res.text()
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      detail = parsed.error?.message || text.slice(0, 500) || undefined
    } catch {
      detail = text.slice(0, 500) || undefined
    }
  } catch {
    detail = undefined
  }
  throw new GoogleGroupsError(res.status, detail)
}

function toGroup(g: RawGroup): ManagedGroup | null {
  if (!g.id || !g.email) return null
  const email = g.email.toLowerCase()
  return { id: g.id, email, name: g.name || email }
}

const groupPath = (groupId: string) => `groups/${encodeURIComponent(groupId)}`

export async function listDomainGroups(
  api: GroupsApi
): Promise<ManagedGroup[]> {
  const out: ManagedGroup[] = []
  let pageToken = ""
  do {
    const q = new URLSearchParams({ domain: api.domain, maxResults: PAGE_SIZE })
    if (pageToken) q.set("pageToken", pageToken)
    const res = await call(api, `groups?${q}`)
    if (!res.ok) await fail(res)
    const data = (await res.json()) as {
      groups?: RawGroup[]
      nextPageToken?: string
    }
    for (const g of data.groups ?? []) {
      const group = toGroup(g)
      if (group) out.push(group)
    }
    pageToken = data.nextPageToken ?? ""
  } while (pageToken)
  return out
}

export async function getGroup(
  api: GroupsApi,
  groupId: string
): Promise<ManagedGroup | null> {
  const res = await call(api, groupPath(groupId))
  // An id that matches isValidGroupId but that Google cannot parse is a 400,
  // not a 404 (measured 2026-10-19). The path carries nothing else, so both
  // mean "no such group".
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) await fail(res)
  return toGroup((await res.json()) as RawGroup)
}

export async function listMembers(
  api: GroupsApi,
  groupId: string
): Promise<GroupMember[]> {
  const out: GroupMember[] = []
  let pageToken = ""
  do {
    const q = new URLSearchParams({ maxResults: PAGE_SIZE })
    if (pageToken) q.set("pageToken", pageToken)
    const res = await call(api, `${groupPath(groupId)}/members?${q}`)
    if (!res.ok) await fail(res)
    const data = (await res.json()) as {
      members?: RawMember[]
      nextPageToken?: string
    }
    for (const m of data.members ?? []) {
      out.push({
        id: m.id ?? null,
        email: m.email ? m.email.toLowerCase() : null,
        role: m.role ?? "",
        type: m.type ?? null,
        status: m.status ?? null,
      })
    }
    pageToken = data.nextPageToken ?? ""
  } while (pageToken)
  return out
}

export type AddedMember = {
  outcome: "ok" | "already"
  /** As Google lists it, lower-cased; the address asked for if Google didn't say. */
  email: string
}

/**
 * Works for addresses with no Google account too. The first outside address
 * makes Google switch the group to "allow external members (admins only)",
 * and it stays that way; the UI warns before this runs.
 *
 * Google may store an address under another spelling than the one sent (a
 * Gmail address without its dots, say), and its member list then uses that
 * spelling. So the address in the reply is passed back for the caller to key
 * on.
 */
export async function addMember(
  api: GroupsApi,
  groupId: string,
  email: string
): Promise<AddedMember> {
  const res = await call(api, `${groupPath(groupId)}/members`, {
    method: "POST",
    body: JSON.stringify({ email, role: "MEMBER" }),
  })
  if (res.status === 409) return { outcome: "already", email }
  if (!res.ok) await fail(res)
  const reply = (await res.json().catch(() => null)) as RawMember | null
  return {
    outcome: "ok",
    email: reply?.email ? reply.email.toLowerCase() : email,
  }
}

export async function removeMember(
  api: GroupsApi,
  groupId: string,
  email: string
): Promise<"ok" | "not_found" | "protected"> {
  const target = email.trim().toLowerCase()
  const member = (await listMembers(api, groupId)).find(
    (m) => m.email === target
  )
  if (!member) return "not_found"
  // Read the role before deleting: a forged request naming an OWNER or
  // MANAGER must never reach DELETE.
  if (!isPlainMember(member.role)) return "protected"
  if (!member.id)
    throw new Error(
      "Google did not return this member's id, so it can't be removed"
    )

  const res = await call(
    api,
    `${groupPath(groupId)}/members/${encodeURIComponent(member.id)}`,
    { method: "DELETE" }
  )
  if (res.status === 404) return "not_found"
  if (!res.ok) await fail(res)
  return "ok"
}
