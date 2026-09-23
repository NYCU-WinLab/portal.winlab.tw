import type { SupabaseClient } from "@supabase/supabase-js"

import type { Trip, TripFile, TripFileWithUser } from "@/lib/trip/types"

// Shared by the client hook (browser client) and the server prefetch (server
// client) — same query + same queryKey so the page hydrates with real rows
// from the HTML instead of a post-hydration client fetch.
export async function fetchTrips(supabase: SupabaseClient): Promise<Trip[]> {
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("status", { ascending: true }) // open first
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data ?? []) as Trip[]
}

// Files of one trip with the uploader's display name. RLS decides the rows:
// trip admins get every member's files, everyone else only their own.
export async function fetchTripFiles(
  supabase: SupabaseClient,
  tripId: string
): Promise<TripFileWithUser[]> {
  const { data, error } = await supabase
    .from("trip_files")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
  if (error) throw error

  const files = (data ?? []) as TripFile[]
  if (files.length === 0) return []

  const userIds = [
    ...new Set(files.map((f) => f.user_id).filter((id): id is string => !!id)),
  ]
  const profileMap = new Map<string, { id: string; name: string | null }>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, name")
      .in("id", userIds)
    for (const p of (profiles ?? []) as { id: string; name: string | null }[]) {
      profileMap.set(p.id, p)
    }
  }

  return files.map((f) => ({
    ...f,
    user: f.user_id
      ? (profileMap.get(f.user_id) ?? { id: f.user_id, name: null })
      : null,
  }))
}
