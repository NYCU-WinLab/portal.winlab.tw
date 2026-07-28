// Mapping between the editable profile fields and Keycloak's admin-API user
// representation. firstName/lastName live top-level on the representation;
// every other editable field is a custom attribute (string arrays in
// Keycloak). Pure functions only in this half of the file — the admin-API
// I/O lives below and is intentionally thin.

import type { EditableProfileField, ProfileUpdate } from "@/lib/profile/schema"
import { EDITABLE_PROFILE_FIELDS } from "@/lib/profile/schema"
import {
  adminEnv,
  adminToken,
  errorDetail,
  isRejectedByKeycloak,
  keycloakAdminConfigured,
  KeycloakAdminError,
  type KeycloakAdminEnv,
} from "@/lib/keycloak/admin"

// Re-exported so existing importers of this module keep working — the
// plumbing moved to lib/keycloak/admin.ts when /rooms started needing it too.
export { isRejectedByKeycloak, keycloakAdminConfigured, KeycloakAdminError }

export type KeycloakUserRepresentation = {
  firstName?: string
  lastName?: string
  attributes?: Record<string, string[]>
  [key: string]: unknown
}

const TOP_LEVEL_FIELDS: ReadonlySet<EditableProfileField> = new Set([
  "firstName",
  "lastName",
])

function adminUserUrl(env: KeycloakAdminEnv, sub: string): string {
  return `${env.url}/admin/realms/${encodeURIComponent(env.realm)}/users/${encodeURIComponent(sub)}`
}

// Three states, because "no edit section" and "edit section is temporarily
// broken" are different things to a member staring at the page. Never throws:
// /profile must render even when Keycloak is unreachable, otherwise an IdP
// blip takes down the stats and the sign-out button with it.
export type EditableProfileResult =
  | { status: "ok"; profile: Record<EditableProfileField, string> }
  | { status: "unconfigured" }
  | { status: "unavailable" }

export async function getEditableProfile(
  sub: string
): Promise<EditableProfileResult> {
  const env = adminEnv()
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

// GET-merge-PUT because Keycloak's admin PUT replaces the attribute map
// wholesale — sending only the edited keys would erase every attribute the
// portal doesn't know about.
export async function updateKeycloakProfile(
  sub: string,
  update: ProfileUpdate
): Promise<void> {
  const env = adminEnv()
  if (!env) throw new Error("keycloak admin env not configured")
  const token = await adminToken(env)
  const getRes = await fetch(adminUserUrl(env, sub), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  })
  if (!getRes.ok)
    throw new KeycloakAdminError(
      "get",
      getRes.status,
      await errorDetail(getRes)
    )
  const rep = (await getRes.json()) as KeycloakUserRepresentation
  const putRes = await fetch(adminUserUrl(env, sub), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(applyProfileToRepresentation(rep, update)),
  })
  if (!putRes.ok)
    throw new KeycloakAdminError(
      "put",
      putRes.status,
      await errorDetail(putRes)
    )
}

export function profileFromRepresentation(
  rep: KeycloakUserRepresentation
): Record<EditableProfileField, string> {
  const attributes = rep.attributes ?? {}
  const profile = {} as Record<EditableProfileField, string>
  for (const field of EDITABLE_PROFILE_FIELDS) {
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

export function applyProfileToRepresentation(
  rep: KeycloakUserRepresentation,
  update: ProfileUpdate
): KeycloakUserRepresentation {
  const next: KeycloakUserRepresentation = {
    ...rep,
    attributes: { ...(rep.attributes ?? {}) },
  }
  for (const field of EDITABLE_PROFILE_FIELDS) {
    const value = update[field]
    if (value === undefined) continue
    if (TOP_LEVEL_FIELDS.has(field)) {
      next[field] = value
    } else if (value === "") {
      delete next.attributes![field]
    } else {
      next.attributes![field] = [value]
    }
  }
  return next
}
