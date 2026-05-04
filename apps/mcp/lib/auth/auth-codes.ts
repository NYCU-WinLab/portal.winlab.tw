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

interface AuthCodeStore {
  insert(code: string, data: StoredAuthData): Promise<void>
  exchange(code: string): Promise<StoredAuthData | null>
}

export function createAuthCodeStore(client: {
  rpc(
    functionName: string,
    args: Record<string, unknown>
  ): PromiseLike<{
    data?: StoredAuthData | null
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
      return data ?? null
    },
  }
}

export async function createAuthCode(data: StoredAuthData): Promise<string> {
  const code = randomBytes(32).toString("hex")
  const supabase = createClient(supabaseUrl, supabasePublishableKey)
  const store = createAuthCodeStore(supabase)
  await store.insert(code, data)
  return code
}

export async function exchangeAuthCode(
  code: string
): Promise<StoredAuthData | null> {
  const supabase = createClient(supabaseUrl, supabasePublishableKey)
  const store = createAuthCodeStore(supabase)
  return store.exchange(code)
}
