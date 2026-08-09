// Shared Keycloak admin-API plumbing: env resolution, the client-credentials
// token exchange, and the error type that carries which leg failed. Lives
// here rather than inside one feature because /profile (user attribute
// edits) and /rooms (group lookups) both need it — same reasoning as
// lib/email/resend.ts being shared across approve and receipts.

export type KeycloakAdminEnv = {
  url: string
  realm: string
  clientId: string
  clientSecret: string
}

export function adminEnv(): KeycloakAdminEnv | null {
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

export async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500) || undefined
  } catch {
    return undefined
  }
}

export async function adminToken(env: KeycloakAdminEnv): Promise<string> {
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

export function adminRealmUrl(env: KeycloakAdminEnv): string {
  return `${env.url}/admin/realms/${encodeURIComponent(env.realm)}`
}
