// Mapping between the editable profile fields and Keycloak's admin-API user
// representation. firstName/lastName live top-level on the representation;
// every other editable field is a custom attribute (string arrays in
// Keycloak). Pure functions only in this half of the file — the admin-API
// I/O lives below and is intentionally thin.

import type { EditableProfileField, ProfileUpdate } from "@/lib/profile/schema"
import { EDITABLE_PROFILE_FIELDS } from "@/lib/profile/schema"

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

type KeycloakAdminEnv = {
  url: string
  realm: string
  clientId: string
  clientSecret: string
}

function adminEnv(): KeycloakAdminEnv | null {
  const url = process.env.KEYCLOAK_URL
  const realm = process.env.KEYCLOAK_REALM
  const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID
  const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET
  if (!url || !realm || !clientId || !clientSecret) return null
  return { url: url.replace(/\/+$/, ""), realm, clientId, clientSecret }
}

export function keycloakAdminConfigured(): boolean {
  return adminEnv() !== null
}

// Carries which leg of the admin round trip failed. The distinction matters to
// the caller: a 4xx on the PUT means Keycloak rejected the user's data and
// retrying changes nothing, while anything else is an infrastructure problem
// the user can reasonably retry.
export class KeycloakAdminError extends Error {
  constructor(
    readonly operation: "token" | "get" | "put",
    readonly status: number,
    readonly detail?: string
  ) {
    super(
      `keycloak ${operation} failed: ${status}${detail ? ` — ${detail}` : ""}`
    )
    this.name = "KeycloakAdminError"
  }
}

export function isRejectedByKeycloak(err: unknown): boolean {
  return (
    err instanceof KeycloakAdminError &&
    err.operation === "put" &&
    err.status >= 400 &&
    err.status < 500
  )
}

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500) || undefined
  } catch {
    return undefined
  }
}

async function adminToken(env: KeycloakAdminEnv): Promise<string> {
  const res = await fetch(
    `${env.url}/realms/${encodeURIComponent(env.realm)}/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.clientId,
        client_secret: env.clientSecret,
      }),
      cache: "no-store",
    }
  )
  if (!res.ok) throw new KeycloakAdminError("token", res.status)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new KeycloakAdminError("token", res.status)
  return data.access_token
}

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
