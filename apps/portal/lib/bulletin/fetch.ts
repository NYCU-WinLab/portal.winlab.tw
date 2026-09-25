import type { SupabaseClient } from "@supabase/supabase-js"

import type { DbAnnouncement } from "@/lib/bulletin/types"

export const ANNOUNCEMENT_BOARD_LIMIT = 10

export async function fetchAnnouncements(
  supabase: SupabaseClient,
  options: { limit?: number; tag?: string } = {}
): Promise<DbAnnouncement[]> {
  const query = supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(options.limit ?? ANNOUNCEMENT_BOARD_LIMIT)
  if (options.tag) query.contains("tags", [options.tag])

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as DbAnnouncement[]
}

// The is_published filter is not redundant with RLS: portal admins may read
// drafts, and a draft is not something the board or a tool should show.
export async function fetchAnnouncement(
  supabase: SupabaseClient,
  id: string
): Promise<DbAnnouncement | null> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*")
    .eq("id", id)
    .eq("is_published", true)
    .maybeSingle()
  if (error) throw error
  return (data as DbAnnouncement | null) ?? null
}

export async function fetchMemberNames(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  const names = new Map<string, string | null>()
  if (unique.length === 0) return names

  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, name")
    .in("id", unique)
  if (error) throw error
  for (const p of (data ?? []) as { id: string; name: string | null }[]) {
    names.set(p.id, p.name)
  }
  return names
}
