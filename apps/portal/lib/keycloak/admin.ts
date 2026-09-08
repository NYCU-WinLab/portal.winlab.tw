// Shared Keycloak Admin-API plumbing: env resolution, the client-credentials
// token exchange, and the error type that carries which leg failed. Lives here
// rather than inside one feature because /profile (showing a member their own
// account fields), /rooms (group lookups) and /meetings (the presenter
// roster's 入學學年 prefill) all read through it.
//
// READ-ONLY BY DESIGN. The credential this resolves is expected to hold
// `view-users` and nothing more. The portal used to carry `manage-users` so
// that /profile could write attributes back, which meant a compromise of this
// process could change any member's email and reset their password — account
// takeover, in exchange for one self-service form. Editing now happens in
// Keycloak's own Account Console, and nothing here writes.
//
// If a future feature genuinely needs to write, that is a decision to make
// deliberately: it re-arms that whole risk, and the reasoning is written up in
// issue #416. Don't quietly widen this client's roles.

export type KeycloakEnv = {
  url: string
  realm: string
  clientId: string
  clientSecret: string
}

export function keycloakEnv(): KeycloakEnv | null {
  const url = process.env.KEYCLOAK_URL
  const realm = process.env.KEYCLOAK_REALM
  const clientId = process.env.KEYCLOAK_READ_CLIENT_ID
  const clientSecret = process.env.KEYCLOAK_READ_CLIENT_SECRET
  if (!url || !realm || !clientId || !clientSecret) return null
  return { url: url.replace(/\/+$/, ""), realm, clientId, clientSecret }
}

export function keycloakConfigured(): boolean {
  return keycloakEnv() !== null
}

/**
 * Where a member edits their own account. Keycloak ships this UI, enforces the
 * realm's own per-attribute permissions on it, and needs no credential from
 * us — which is the entire reason the portal no longer holds one that can
 * write. Returns null when Keycloak isn't configured, so callers hide the link
 * rather than rendering one that goes nowhere.
 */
export function accountConsoleUrl(): string | null {
  const env = keycloakEnv()
  if (!env) return null
  return `${env.url}/realms/${encodeURIComponent(env.realm)}/account`
}

// Carries which leg of the round trip failed. The distinction matters to the
// caller: a token failure is a configuration problem, a 403 on a read is a
// missing role, and anything else is usually transient.
export class KeycloakAdminError extends Error {
  constructor(
    readonly operation: "token" | "get",
    readonly status: number,
    readonly detail?: string
  ) {
    super(
      `keycloak ${operation} failed: ${status}${detail ? ` — ${detail}` : ""}`
    )
    this.name = "KeycloakAdminError"
  }
}

export async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500) || undefined
  } catch {
    return undefined
  }
}

export async function adminToken(env: KeycloakEnv): Promise<string> {
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

export function adminRealmUrl(env: KeycloakEnv): string {
  return `${env.url}/admin/realms/${encodeURIComponent(env.realm)}`
}
