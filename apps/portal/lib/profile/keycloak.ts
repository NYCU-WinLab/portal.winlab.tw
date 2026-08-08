// Reads a member's account fields out of Keycloak's user representation for
// display on /profile. firstName/lastName live top-level on the
// representation; every other field is a custom attribute (string arrays in
// Keycloak). Pure mapping in the top half, thin Admin-API reads below.
//
// Nothing here writes. Members edit their own account in Keycloak's Account
// Console, which is why this app no longer needs a credential that can — see
// lib/keycloak/admin.ts and issue #416.

import {
  adminToken,
  errorDetail,
  keycloakConfigured,
  KeycloakAdminError,
  keycloakEnv,
  type KeycloakEnv,
} from "@/lib/keycloak/admin"
import type { ProfileField } from "@/lib/profile/schema"
import { PROFILE_FIELDS } from "@/lib/profile/schema"

// Re-exported so importers of this module keep working — the plumbing moved to
// lib/keycloak/admin.ts when /rooms started needing it too.
export { keycloakConfigured, KeycloakAdminError }

export type KeycloakUserRepresentation = {
  firstName?: string
  lastName?: string
  attributes?: Record<string, string[]>
  [key: string]: unknown
}

const TOP_LEVEL_FIELDS: ReadonlySet<ProfileField> = new Set([
  "firstName",
  "lastName",
])

function adminUserUrl(env: KeycloakEnv, sub: string): string {
  return `${env.url}/admin/realms/${encodeURIComponent(env.realm)}/users/${encodeURIComponent(sub)}`
}

// Three states, because "no account section" and "account section is
// temporarily broken" are different things to a member staring at the page.
// Never throws: /profile must render even when Keycloak is unreachable,
// otherwise an IdP blip takes down the stats and the sign-out button with it.
export type ProfileFieldsResult =
  | { status: "ok"; profile: Record<ProfileField, string> }
  | { status: "unconfigured" }
  | { status: "unavailable" }

export async function getProfileFields(
  sub: string
): Promise<ProfileFieldsResult> {
  const env = keycloakEnv()
  if (!env) return { status: "unconfigured" }
  try {
    const token = await adminToken(env)
    const res = await fetch(adminUserUrl(env, sub), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
    if (!res.ok) {
      console.error(
        "[profile] keycloak read failed",
        new KeycloakAdminError("get", res.status, await errorDetail(res))
      )
      return { status: "unavailable" }
    }
    return {
      status: "ok",
      profile: profileFromRepresentation(
        (await res.json()) as KeycloakUserRepresentation
      ),
    }
  } catch (err) {
    console.error("[profile] keycloak read failed", err)
    return { status: "unavailable" }
  }
}

// Read another member's attributes, by email. Unlike getProfileFields this is
// not about the caller's own account — it exists so an admin building the
// presenter roster can pull someone's 入學學年 from the IdP instead of
// retyping it. Callers MUST gate on admin themselves; this only knows how to
// fetch.
//
// Never throws, for the same reason as above: a Keycloak blip should degrade
// to "type it in by hand", not break the page.
export async function lookupAttributesByEmail(
  email: string
): Promise<Record<string, string[]> | null> {
  const env = keycloakEnv()
  if (!env || email.length === 0) return null
  try {
    const token = await adminToken(env)
    const query = new URLSearchParams({ email, exact: "true", max: "2" })
    const res = await fetch(
      `${env.url}/admin/realms/${encodeURIComponent(env.realm)}/users?${query}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    )
    if (!res.ok) {
      console.error(
        "[meetings] keycloak lookup failed",
        new KeycloakAdminError("get", res.status, await errorDetail(res))
      )
      return null
    }
    const users = (await res.json()) as KeycloakUserRepresentation[]
    // Two hits means the email is not the unique key we assumed; guessing
    // which one is right would quietly attach the wrong year to someone.
    if (users.length !== 1) return null
    return (users[0]?.attributes as Record<string, string[]>) ?? {}
  } catch (err) {
    console.error("[meetings] keycloak lookup failed", err)
    return null
  }
}

export function profileFromRepresentation(
  rep: KeycloakUserRepresentation
): Record<ProfileField, string> {
  const attributes = rep.attributes ?? {}
  const profile = {} as Record<ProfileField, string>
  for (const field of PROFILE_FIELDS) {
    if (TOP_LEVEL_FIELDS.has(field)) {
      const value = rep[field]
      profile[field] = typeof value === "string" ? value : ""
    } else {
      profile[field] = attributes[field]?.[0] ?? ""
    }
  }
  return profile
}

type IdentityLike = {
  provider: string
  id?: string
  identity_data?: Record<string, unknown>
}

export function keycloakSubFromIdentities(
  identities: IdentityLike[] | null | undefined
): string | null {
  const identity = identities?.find((i) => i.provider === "keycloak")
  if (!identity) return null
  const sub = identity.identity_data?.sub
  if (typeof sub === "string" && sub.length > 0) return sub
  return identity.id && identity.id.length > 0 ? identity.id : null
}
