// Reads the realm's group tree so the attendee picker can offer "add
// everyone in this subgroup" instead of making people click members one by
// one. Read-only — nothing here writes back to Keycloak.
//
// Needs the admin client to hold `query-groups` and `view-users` on top of
// the `manage-users` it already had for /profile. Without them Keycloak
// answers 403 and this degrades to "no groups offered" rather than breaking
// the picker.

import {
  adminEnv,
  adminRealmUrl,
  adminToken,
  errorDetail,
  KeycloakAdminError,
  type KeycloakAdminEnv,
} from "@/lib/keycloak/admin"

export interface KeycloakGroupMember {
  /** Keycloak's own user id — not the portal user_profiles id. */
  id: string
  email: string | null
  name: string | null
}

export interface AttendeeGroup {
  id: string
  /** Just this group's own name, e.g. "ai". */
  name: string
  /** Full path including parents, e.g. "/winlab-projects/ai". */
  path: string
  members: KeycloakGroupMember[]
}

type RawGroup = {
  id: string
  name: string
  path: string
  subGroups?: RawGroup[]
}

type RawMember = {
  id: string
  email?: string
  firstName?: string
  lastName?: string
  username?: string
}

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

/**
 * Every group that has a parent — i.e. the leaf-ish groups people actually
 * belong to, not the top-level containers. Keycloak nests arbitrarily deep,
 * so this walks the whole tree rather than assuming exactly two levels.
 */
function flattenSubGroups(roots: RawGroup[]): RawGroup[] {
  const out: RawGroup[] = []
  const walk = (group: RawGroup, depth: number) => {
    if (depth > 0) out.push(group)
    for (const child of group.subGroups ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  return out
}

function displayName(member: RawMember): string | null {
  const full = [member.firstName, member.lastName].filter(Boolean).join(" ")
  return full || member.username || member.email || null
}

/**
 * Subgroups and their members. Returns null when the admin client isn't
 * configured or Keycloak refuses — the caller treats that as "this feature
 * isn't available", never as an error worth failing a booking over.
 */
export async function fetchAttendeeGroups(): Promise<AttendeeGroup[] | null> {
  const env = adminEnv()
  if (!env) return null

  try {
    const token = await adminToken(env)
    const base = adminRealmUrl(env)

    // `briefRepresentation=false` is what makes Keycloak include subGroups on
    // the tree response; without it newer versions return only the top level.
    const roots = await getJson<RawGroup[]>(
      `${base}/groups?briefRepresentation=false&max=500`,
      token
    )

    const subGroups = flattenSubGroups(roots)
    if (subGroups.length === 0) return []

    return await Promise.all(
      subGroups.map(async (group) => ({
        id: group.id,
        name: group.name,
        path: group.path,
        members: await fetchGroupMembers(env, token, group.id),
      }))
    )
  } catch (err) {
    console.error("[rooms] keycloak group read failed", err)
    return null
  }
}

async function fetchGroupMembers(
  env: KeycloakAdminEnv,
  token: string,
  groupId: string
): Promise<KeycloakGroupMember[]> {
  const raw = await getJson<RawMember[]>(
    `${adminRealmUrl(env)}/groups/${encodeURIComponent(groupId)}/members?max=500`,
    token
  )
  return raw.map((m) => ({
    id: m.id,
    email: m.email ?? null,
    name: displayName(m),
  }))
}
