import type { AuthSession, AuthUser } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type NormalizedUser = {
  id: string
  email: string | null
  name: string
  avatarUrl: string | null
}

export type Profile = {
  user: AuthUser
  session: AuthSession | null
}

export function normalizeUser(user: AuthUser): NormalizedUser {
  const meta = user.user_metadata
  const pick = (key: string) => {
    const value = meta[key]
    return typeof value === "string" ? value : undefined
  }
  const name =
    pick("full_name") ??
    pick("name") ??
    pick("preferred_username") ??
    user.email ??
    "Unknown"
  const avatarUrl = pick("avatar_url") ?? pick("picture") ?? null

  return {
    id: user.id,
    email: user.email ?? null,
    name,
    avatarUrl,
  }
}

type ClaimsShape = {
  sub: string
  email?: string
  user_metadata?: Record<string, unknown>
}

export function normalizeClaims(claims: ClaimsShape): NormalizedUser {
  const meta = claims.user_metadata ?? {}
  const pick = (key: string) => {
    const value = meta[key]
    return typeof value === "string" ? value : undefined
  }
  const name =
    pick("full_name") ??
    pick("name") ??
    pick("preferred_username") ??
    claims.email ??
    "Unknown"
  const avatarUrl = pick("avatar_url") ?? pick("picture") ?? null

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

export async function getCurrentAuthUser(): Promise<AuthUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return null
  return data.user
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

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient()
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  if (!userData?.user) return null
  return {
    user: userData.user,
    session: sessionData?.session ?? null,
  }
}
