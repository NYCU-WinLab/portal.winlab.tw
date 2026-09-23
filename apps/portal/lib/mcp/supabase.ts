import type { AuthInfo } from "@modelcontextprotocol/server"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { keycloakSubFromIdentities } from "@/lib/profile/keycloak"
import type { Database } from "@/lib/supabase/database.types"

function env() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  }
}

// Issuer that MCP clients will see in the protected-resource metadata. It has
// to match the `issuer` in Supabase's own RFC 8414 document, which is the
// /auth/v1 base rather than the bare project host.
export function supabaseIssuer(): string {
  return `${env().url}/auth/v1`
}

// The project signs with a shared secret (HS256), so the only trustworthy
// check is asking the Auth server itself. `getUser(jwt)` does exactly that and
// also catches revoked sessions, which a local signature check would miss.
export async function verifySupabaseToken(
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined
  const { url, key } = env()
  const supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  const { data, error } = await supabase.auth.getUser(bearerToken)
  if (error || !data.user) return undefined

  const user = data.user
  return {
    token: bearerToken,
    clientId: user.id,
    scopes: [],
    extra: {
      userId: user.id,
      email: user.email ?? null,
      name: displayName(user.user_metadata),
      // createUserClient cannot call auth.getUser (accessToken mode), so the
      // identity a tool may need later is resolved here, once.
      keycloakSub: keycloakSubFromIdentities(user.identities),
    },
  }
}

function displayName(meta: Record<string, unknown> | undefined): string | null {
  for (const key of ["full_name", "name", "preferred_username"]) {
    const value = meta?.[key]
    if (typeof value === "string" && value) return value
  }
  return null
}

// A client that acts as the caller: every query goes through RLS exactly like
// the browser's, because the token is the same kind of Supabase JWT.
export function createUserClient(token: string): SupabaseClient<Database> {
  const { url, key } = env()
  return createClient<Database>(url, key, {
    accessToken: async () => token,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
