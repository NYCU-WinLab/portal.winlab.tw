import type { AuthSession, AuthUser } from "@supabase/supabase-js"
import { cache } from "react"

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

/**
 * A member's display name from their Supabase user metadata, or undefined when
 * it carries none.
 *
 * Keycloak's `chinese_name` attribute comes first: Supabase files it under
 * `custom_claims` and it is already family first (何承運), which the OIDC
 * `name` ("<given> <family>") never is. This is the same first choice as
 * public.member_display_name(), which fills user_profiles.name, so a member
 * reads the same in the header as in every list. The rest of the chain is
 * what the portal used before chinese_name existed.
 */
export function displayNameFromMetadata(
  meta: Record<string, unknown> | undefined
): string | undefined {
  const customClaims = meta?.custom_claims
  if (customClaims && typeof customClaims === "object") {
    const chinese = (customClaims as Record<string, unknown>).chinese_name
    if (typeof chinese === "string" && chinese.trim()) return chinese.trim()
  }
  for (const key of ["full_name", "name", "preferred_username"]) {
    const value = meta?.[key]
    if (typeof value === "string") return value
  }
  return undefined
}

export function normalizeUser(user: AuthUser): NormalizedUser {
  const meta = user.user_metadata
  const pick = (key: string) => {
    const value = meta[key]
    return typeof value === "string" ? value : undefined
  }
  const name = displayNameFromMetadata(meta) ?? user.email ?? "Unknown"
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
  const name = displayNameFromMetadata(meta) ?? claims.email ?? "Unknown"
  const avatarUrl = pick("avatar_url") ?? pick("picture") ?? null

  return {
    id: claims.sub,
    email: claims.email ?? null,
    name,
    avatarUrl,
  }
}

// Memoizes the create-client + getClaims work within a single request/render
// pass, so callers like getCurrentUser() and getInitialAuthUser() don't each
// re-verify the same JWT with a brand-new Supabase client.
const getCachedClaims = cache(async () => {
  const supabase = await createClient()
  return supabase.auth.getClaims()
})

export async function getCurrentUser(): Promise<NormalizedUser | null> {
  const { data, error } = await getCachedClaims()
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
  const { data, error } = await getCachedClaims()
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
