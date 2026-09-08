// Reads the realm's group tree so the attendee picker can offer "add
// everyone in this subgroup" instead of making people click members one by
// one. Read-only — nothing here writes back to Keycloak.
//
// Needs the service account to hold `view-users` — a composite that includes
// `query-groups`, which is what the /groups listing actually checks. Without
// it Keycloak answers 403, which is reported back rather than swallowed: a
// silently empty group list is indistinguishable from "the realm has no
// groups", and that cost real debugging time once already.

import {
  keycloakEnv,
  adminRealmUrl,
  adminToken,
  errorDetail,
  KeycloakAdminError,
  type KeycloakEnv,
} from "@/lib/keycloak/admin"

import { needsChildrenFetch } from "./group-tree"

export interface KeycloakGroupMember {
  /** Keycloak's own user id — not the portal user_profiles id. */
  id: string
  email: string | null
  name: string | null
  /**
   * The login name, e.g. `n0ball`. Carried through because it's the ASCII
   * identifier the Teams topic prefix is built from when a meeting is booked
   * without picking a whole group — `name` is Chinese.
   */
  username: string | null
}

export interface AttendeeGroup {
  id: string
  /** Just this group's own name, e.g. "ai". */
  name: string
  /**
   * Human-readable label, when the group carries one. Keycloak only gained
   * a native `description` on GroupRepresentation recently; before that the
   * convention was an attribute of the same name. Read both, since which
   * one this realm uses isn't something to guess at.
   */
  description: string | null
  /** Full path including parents, e.g. "/winlab-projects/ai". */
  path: string
  /**
   * The group's GitLab group path, from the `gitlab_path` attribute.
   *
   * Keycloak is flat (`/winlab-projects/tasa-satsim`) where GitLab nests
   * (`winlab/network-system-design/tasa-satsim`), so the two can't be derived
   * from each other — this attribute is the only mapping between them. Null
   * for a group nobody has linked yet, which is a real state: those groups
   * get no epic picker rather than a wrong one.
   */
  gitlabPath: string | null
  members: KeycloakGroupMember[]
}

export type AttendeeGroupsResult =
  | {
      status: "ok"
      groups: AttendeeGroup[]
      /** Top-level groups seen, to tell "realm is empty" from "no children". */
      rootGroupCount: number
    }
  | { status: "unconfigured" }
  | { status: "forbidden"; detail: string }
  | { status: "error"; detail: string }

type RawGroup = {
  id: string
  name: string
  path: string
  description?: string
  attributes?: Record<string, string[]>
  subGroups?: RawGroup[]
  subGroupCount?: number
}

function groupDescription(group: RawGroup): string | null {
  const native = group.description?.trim()
  if (native) return native
  const attribute = group.attributes?.description?.[0]?.trim()
  return attribute || null
}

/**
 * Keycloak stores every attribute as an array of strings, so the value is
 * `attributes.gitlab_path[0]` rather than a plain field. A group that was
 * given the attribute and then had it cleared comes back as `[""]`, which is
 * the same as never having had one.
 */
function groupGitlabPath(group: RawGroup): string | null {
  return group.attributes?.gitlab_path?.[0]?.trim() || null
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

function displayName(member: RawMember): string | null {
  const full = [member.firstName, member.lastName].filter(Boolean).join(" ")
  return full || member.username || member.email || null
}

/**
 * Every group below the top level — the ones people actually belong to,
 * not the containers.
 *
 * Keycloak 23 stopped populating `subGroups` on the group-list response and
 * moved children to their own endpoint, so this walks with an explicit
 * `/children` fetch and only falls back to the inline `subGroups` when the
 * server still sends it. Handling both keeps this working across versions
 * instead of silently returning nothing on one of them.
 */
async function collectSubGroups(
  env: KeycloakEnv,
  token: string,
  group: RawGroup,
  depth: number,
  out: RawGroup[]
): Promise<void> {
  if (depth > 0) out.push(group)

  // Keycloak 23+ sends `subGroups: []` — an *empty array*, not an omitted
  // field — alongside a `subGroupCount`. So `subGroups ?? fetch(...)` never
  // fell through and /children was never actually called, which is why a
  // realm with populated subgroups still reported having none. Treat only a
  // non-empty inline array as authoritative.
  //
  // No `.catch(() => [])` here on purpose: swallowing a failed /children
  // call reports "this realm has no subgroups", which is a different
  // problem with a different fix. Let it propagate to the status result.
  const children = needsChildrenFetch(group)
    ? await getJson<RawGroup[]>(
        `${adminRealmUrl(env)}/groups/${encodeURIComponent(group.id)}/children?max=500`,
        token
      )
    : group.subGroups!

  // Siblings are independent, so descend into them together rather than
  // one round trip at a time.
  const nested = await Promise.all(
    children.map(async (child) => {
      const found: RawGroup[] = []
      await collectSubGroups(env, token, child, depth + 1, found)
      return found
    })
  )
  out.push(...nested.flat())
}

/**
 * Every subgroup in the realm, with its attributes, and how many top-level
 * groups it came from.
 *
 * Walks the roots concurrently. Serially this was one /children round trip
 * per top-level group before anything else could start — 15 of them here,
 * which is most of the wait before the picker can render.
 */
async function collectRealmSubGroups(
  env: KeycloakEnv,
  token: string
): Promise<{ subGroups: RawGroup[]; rootGroupCount: number }> {
  const roots = await getJson<RawGroup[]>(
    `${adminRealmUrl(env)}/groups?briefRepresentation=false&max=500`,
    token
  )
  const perRoot = await Promise.all(
    roots.map(async (root) => {
      const found: RawGroup[] = []
      await collectSubGroups(env, token, root, 0, found)
      return found
    })
  )
  return { subGroups: perRoot.flat(), rootGroupCount: roots.length }
}

/**
 * The GitLab group path a Keycloak group leaf maps to, or null.
 *
 * Resolved here rather than taken from the browser: the caller only sends the
 * group name the booking was made under, and a client-supplied GitLab path
 * would let anyone read any group the `read_api` token can see. A leaf that
 * matches more than one group resolves to nothing — guessing which one was
 * meant is how a meeting ends up filed under the wrong project.
 */
export async function gitlabPathForGroup(
  groupName: string | null | undefined
): Promise<string | null> {
  const name = groupName?.trim()
  if (!name) return null

  const env = keycloakEnv()
  if (!env) return null

  try {
    const token = await adminToken(env)
    const { subGroups } = await collectRealmSubGroups(env, token)
    const matches = subGroups.filter((g) => g.name === name)
    if (matches.length !== 1) return null
    return groupGitlabPath(matches[0]!)
  } catch (err) {
    console.error("[rooms] keycloak gitlab_path lookup failed", err)
    return null
  }
}

export async function fetchAttendeeGroups(): Promise<AttendeeGroupsResult> {
  const env = keycloakEnv()
  if (!env) return { status: "unconfigured" }

  try {
    const token = await adminToken(env)
    const { subGroups, rootGroupCount } = await collectRealmSubGroups(
      env,
      token
    )
    if (subGroups.length === 0) {
      return { status: "ok", groups: [], rootGroupCount }
    }

    const groups = await Promise.all(
      subGroups.map(async (group) => ({
        id: group.id,
        name: group.name,
        description: groupDescription(group),
        path: group.path,
        gitlabPath: groupGitlabPath(group),
        members: await fetchGroupMembers(env, token, group.id),
      }))
    )
    return { status: "ok", groups, rootGroupCount }
  } catch (err) {
    const detail =
      err instanceof KeycloakAdminError
        ? `${err.status}${err.detail ? ` — ${err.detail}` : ""}`
        : err instanceof Error
          ? err.message
          : "unknown"
    console.error("[rooms] keycloak group read failed", err)

    if (err instanceof KeycloakAdminError && err.status === 403) {
      return { status: "forbidden", detail }
    }
    return { status: "error", detail }
  }
}

async function fetchGroupMembers(
  env: KeycloakEnv,
  token: string,
  groupId: string
): Promise<KeycloakGroupMember[]> {
  // briefRepresentation=false is what makes Keycloak include `email` on each
  // member. The brief form carries id/username/name only, and email is the
  // key everything downstream matches Portal accounts on — without it every
  // member looks like someone with no Portal account.
  const raw = await getJson<RawMember[]>(
    `${adminRealmUrl(env)}/groups/${encodeURIComponent(groupId)}/members?briefRepresentation=false&max=500`,
    token
  )
  return raw.map((m) => ({
    id: m.id,
    email: m.email ?? null,
    name: displayName(m),
    username: m.username ?? null,
  }))
}
