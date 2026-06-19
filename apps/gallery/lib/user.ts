import { createClient } from "@/lib/supabase/server"

export type NormalizedUser = {
  id: string
  email: string | null
  name: string
  avatarUrl: string | null
  isAdmin: boolean
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
    isAdmin: false,
  }
}

export async function getCurrentUser(): Promise<NormalizedUser | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  const base = normalizeClaims(data.claims)
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("name, is_admin")
    .eq("id", base.id)
    .maybeSingle()

  const profileName =
    typeof profile?.name === "string" && profile.name.trim()
      ? profile.name.trim()
      : null

  return {
    ...base,
    name: profileName ?? base.name,
    isAdmin: profile?.is_admin === true,
  }
}
