import type { SupabaseClient } from "@supabase/supabase-js"

import type { Leave, LeaveWithUser } from "@/lib/leave/types"

// Single source of truth for the leave-list query, shared by the client hook
// (browser client) and the server prefetch (server client). Same queryKey on
// both sides lets the server-prefetched data hydrate the client cache, so the
// page paints real rows from the HTML instead of waiting on a client fetch.
// RLS applies through whichever client is passed in.
export async function fetchLeaves(
  supabase: SupabaseClient
): Promise<LeaveWithUser[]> {
  const { data, error } = await supabase
    .from("leaves")
    .select("*")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })

  if (error) throw error

  const leaves = (data ?? []) as Leave[]
  if (leaves.length === 0) return []

  const userIds = [...new Set(leaves.map((l) => l.user_id))]
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, name")
    .in("id", userIds)

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; name: string | null }) => [p.id, p])
  )

  return leaves.map((leave) => ({
    ...leave,
    user: profileMap.has(leave.user_id)
      ? { name: profileMap.get(leave.user_id)!.name ?? null }
      : null,
  })) as LeaveWithUser[]
}
