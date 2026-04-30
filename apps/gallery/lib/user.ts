import type { AuthUser } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type NormalizedUser = {
  id: string
  email: string | null
  name: string
  avatarUrl: string | null
}

function pickString(meta: Record<string, unknown>, key: string) {
  const value = meta[key]
  return typeof value === "string" ? value : undefined
}

type ClaimsShape = {
  sub: string
  email?: string
  user_metadata?: Record<string, unknown>
}

export function normalizeClaims(claims: ClaimsShape): NormalizedUser {
  const meta = claims.user_metadata ?? {}
  const name =
    pickString(meta, "full_name") ??
    pickString(meta, "name") ??
    pickString(meta, "preferred_username") ??
    claims.email ??
    "Unknown"
  const avatarUrl =
    pickString(meta, "avatar_url") ?? pickString(meta, "picture") ?? null

  return {
    id: claims.sub,
    email: claims.email ?? null,
    name,
    avatarUrl,
  }
}

export async function getCurrentUser(): Promise<NormalizedUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  return normalizeClaims(data.claims)
}

// Reads JWT claims (no Auth API call) and shapes into a lightweight AuthUser
// seed for the client AuthProvider. Full AuthUser will be filled in via
// onAuthStateChange once the browser hydrates.
export async function getInitialAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  const claims = data.claims
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    user_metadata:
      (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as unknown as AuthUser
}
