import { createClient } from "@supabase/supabase-js"
import { randomBytes } from "node:crypto"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

export interface StoredAuthData {
  accessToken: string
  refreshToken: string
  expiresIn: number | null
  codeChallenge: string
  redirectUri: string
  clientId: string
  resource?: string
}

// Metadata needed to validate a token request *before* the code is consumed.
// Deliberately excludes accessToken/refreshToken — mcp_peek_oauth_auth_code
// never returns them (see the migration), so this type can't carry them either.
export interface PeekedAuthData {
  codeChallenge: string
  redirectUri: string
  clientId: string
  resource?: string
  expiresAt: string
}

interface PeekedAuthCodeRow {
  client_id: string
  redirect_uri: string
  resource: string | null
  code_challenge: string
  expires_at: string
}

export interface AuthCodeStore {
  insert(code: string, data: StoredAuthData): Promise<void>
  exchange(code: string): Promise<StoredAuthData | null>
  peek(code: string): Promise<PeekedAuthData | null>
}

export function createAuthCodeStore(client: {
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): PromiseLike<{
    data?: unknown
    error: { message: string } | null
  }>
}): AuthCodeStore {
  return {
    async insert(code: string, data: StoredAuthData) {
      const { error } = await client.rpc("mcp_create_oauth_auth_code", {
        p_code: code,
        p_data: data,
      })
      if (error) throw new Error(`Failed to store auth code: ${error.message}`)
    },
    async exchange(code: string) {
      const { data, error } = await client.rpc("mcp_exchange_oauth_auth_code", {
        p_code: code,
      })
      if (error)
        throw new Error(`Failed to exchange auth code: ${error.message}`)
      return (data as StoredAuthData | null) ?? null
    },
    async peek(code: string) {
      const { data, error } = await client.rpc("mcp_peek_oauth_auth_code", {
        p_code: code,
      })
      if (error) throw new Error(`Failed to peek auth code: ${error.message}`)
      const rows = (data as PeekedAuthCodeRow[] | null) ?? []
      const row = rows[0]
      if (!row) return null
      return {
        codeChallenge: row.code_challenge,
        redirectUri: row.redirect_uri,
        clientId: row.client_id,
        resource: row.resource ?? undefined,
        expiresAt: row.expires_at,
      }
    },
  }
}

function createDatabaseAuthCodeStore(): AuthCodeStore {
  const supabase = createClient(supabaseUrl, supabasePublishableKey)
  return createAuthCodeStore(supabase)
}

export async function createAuthCode(data: StoredAuthData): Promise<string> {
  const code = randomBytes(32).toString("hex")
  const store = createDatabaseAuthCodeStore()
  await store.insert(code, data)
  return code
}

export async function exchangeAuthCode(
  code: string
): Promise<StoredAuthData | null> {
  const store = createDatabaseAuthCodeStore()
  return store.exchange(code)
}

// Read-only lookup used by the token route to validate redirect_uri /
// client_id / resource / PKCE *before* burning the code via exchangeAuthCode.
// See mcp_peek_oauth_auth_code — it never returns tokens.
export async function peekAuthCode(
  code: string
): Promise<PeekedAuthData | null> {
  const store = createDatabaseAuthCodeStore()
  return store.peek(code)
}
