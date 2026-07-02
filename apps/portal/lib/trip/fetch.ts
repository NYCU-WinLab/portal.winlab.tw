import type { SupabaseClient } from "@supabase/supabase-js"

import type { Trip } from "@/lib/trip/types"

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
