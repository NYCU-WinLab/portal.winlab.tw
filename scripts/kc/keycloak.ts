// Thin Admin REST API client for the `kc` tool.
//
// Kept separate from apps/portal/lib/profile/keycloak.ts on purpose: that
// module is coupled to the portal's EDITABLE_PROFILE_FIELDS whitelist and the
// `@/` alias, neither of which exists outside the Next.js app. The shared
// invariants (cache the token, never partial-PUT) are re-stated here rather
// than imported.
//
// Token facts, from the research record §4:
//   - client_credentials returns NO refresh token, by design.
//   - the realm default access token lifespan is 300s, but that is a code
//     default, not a documented promise — read `expires_in` off the response.

export class KeycloakError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number,
    readonly detail?: string
  ) {
    super(
      `keycloak ${operation} failed: ${status}${detail ? ` — ${detail}` : ""}`
    )
    this.name = "KeycloakError"
  }
}

async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    return (await res.text()).slice(0, 500) || undefined
  } catch {
    return undefined
  }
}

export type TokenResult = {
  accessToken: string
  expiresIn: number
}

function tokenUrl(url: string, realm: string): string {
  return `${url}/realms/${encodeURIComponent(realm)}/protocol/openid-connect/token`
}

async function requestToken(
  url: string,
  realm: string,
  body: URLSearchParams,
  operation: string
): Promise<TokenResult> {
  const res = await fetch(tokenUrl(url, realm), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    throw new KeycloakError(operation, res.status, await errorDetail(res))
  }
  const data = (await res.json()) as {
    access_token?: string
    expires_in?: number
  }
  if (!data.access_token) {
    throw new KeycloakError(
      operation,
      res.status,
      "no access_token in response"
    )
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 0 }
}

export function serviceAccountToken(
  url: string,
  realm: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResult> {
  return requestToken(
    url,
    realm,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    "client_credentials"
  )
}

// Bootstrap only. `admin-cli` is a public client with direct access grants
// enabled by default, which is what makes the zero-UI provisioning path
// possible. Fails if the admin account has OTP configured — there is no
// password-grant path around that, and the fallback is a one-off client
// created by hand.
export function passwordToken(
  url: string,
  realm: string,
  clientId: string,
  username: string,
  password: string
): Promise<TokenResult> {
  return requestToken(
    url,
    realm,
    new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      username,
      password,
    }),
    "password grant"
  )
}

/** Unverified decode — we only read our own freshly-issued token's claims. */
export function decodeTokenClaims(token: string): Record<string, unknown> {
  const payload = token.split(".")[1]
  if (!payload) return {}
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return {}
  }
}

export function realmManagementRoles(token: string): string[] {
  const claims = decodeTokenClaims(token)
  const access = claims.resource_access as
    | Record<string, { roles?: string[] }>
    | undefined
  return access?.["realm-management"]?.roles ?? []
}

export class AdminApi {
  constructor(
    private readonly url: string,
    private readonly realm: string,
    private readonly token: string
  ) {}

  private base(): string {
    return `${this.url}/admin/realms/${encodeURIComponent(this.realm)}`
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: T | null }> {
    const res = await fetch(`${this.base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      // The admin API is not cacheable and Bun would happily reuse a 200.
      cache: "no-store",
    })
    if (res.status === 204 || res.status === 201) {
      return { status: res.status, data: null }
    }
    if (!res.ok) {
      throw new KeycloakError(
        `${method} ${path}`,
        res.status,
        await errorDetail(res)
      )
    }
    const text = await res.text()
    return {
      status: res.status,
      data: text.length > 0 ? (JSON.parse(text) as T) : null,
    }
  }

  async get<T>(path: string): Promise<T> {
    const { data } = await this.request<T>("GET", path)
    return data as T
  }

  async post<T>(path: string, body: unknown): Promise<{ status: number }> {
    return this.request<T>("POST", path, body)
  }

  async put<T>(path: string, body: unknown): Promise<{ status: number }> {
    return this.request<T>("PUT", path, body)
  }
}

export type UserRepresentation = {
  id: string
  username?: string
  email?: string
  firstName?: string
  lastName?: string
  enabled?: boolean
  /** Custom attributes only — root fields left this map in Keycloak 24. */
  attributes?: Record<string, string[]>
}

export type UserProfileAttribute = {
  name: string
  displayName?: string
  permissions?: { view?: string[]; edit?: string[] }
  validations?: Record<string, unknown>
  annotations?: Record<string, unknown>
  required?: unknown
  group?: string
}

export type UserProfileConfig = {
  unmanagedAttributePolicy?:
    | "DISABLED"
    | "ENABLED"
    | "ADMIN_VIEW"
    | "ADMIN_EDIT"
  attributes?: UserProfileAttribute[]
  groups?: unknown[]
}

/**
 * The realm's user profile config decides whether the Admin API can see or
 * write a custom attribute at all — a stricter gate than any role. Absent
 * `unmanagedAttributePolicy` means DISABLED, which is Keycloak's default and
 * the single most common cause of "the attribute is just… not there".
 */
export function unmanagedPolicy(config: UserProfileConfig): string {
  return config.unmanagedAttributePolicy ?? "DISABLED"
}

export function findProfileAttribute(
  config: UserProfileConfig,
  name: string
): UserProfileAttribute | null {
  return config.attributes?.find((a) => a.name === name) ?? null
}

/**
 * The regex a managed attribute's value must satisfy, if the realm declares
 * one. Keycloak enforces these on write and rejects the whole PUT with a 400,
 * so anything writing attributes should check first rather than discover it
 * halfway through a batch.
 */
export function attributePattern(
  attribute: UserProfileAttribute
): { source: string; message?: string } | null {
  const validation = attribute.validations?.pattern as
    | { pattern?: string; "error-message"?: string }
    | undefined
  if (!validation?.pattern) return null
  return {
    source: validation.pattern,
    message: validation["error-message"],
  }
}

/** Human-readable one-liner of an attribute's declared validations. */
export function describeValidations(attribute: UserProfileAttribute): string {
  const entries = Object.entries(attribute.validations ?? {})
  if (entries.length === 0) return "no validation"
  return entries
    .map(([name, config]) => {
      if (name === "pattern") {
        const pattern = (config as { pattern?: string }).pattern
        return `pattern ${pattern ?? "?"}`
      }
      if (name === "length") {
        const { min, max } = config as { min?: number; max?: number }
        return `length ${min ?? "-"}..${max ?? "-"}`
      }
      return name
    })
    .join(", ")
}
