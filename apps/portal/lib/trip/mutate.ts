import type { SupabaseClient } from "@supabase/supabase-js"

import type { Trip, TripStatus } from "@/lib/trip/types"

// Trip writes shared by the /trip hooks and the MCP tools. RLS lets only trip
// admins (is_trip_admin) insert or update a trip.
export async function createTrip(
  supabase: SupabaseClient,
  params: { name: string; description?: string | null }
): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .insert({
      name: params.name,
      description: params.description ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data as Trip
}

export async function updateTrip(
  supabase: SupabaseClient,
  params: { id: string; name: string; description?: string | null }
): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update({
      name: params.name,
      description: params.description ?? null,
    })
    .eq("id", params.id)
    .select()
    .single()
  if (error) throw error
  return data as Trip
}

export async function setTripStatus(
  supabase: SupabaseClient,
  params: { id: string; status: TripStatus }
): Promise<Trip> {
  const { data, error } = await supabase
    .from("trips")
    .update({
      status: params.status,
      closed_at: params.status === "closed" ? new Date().toISOString() : null,
    })
    .eq("id", params.id)
    .select()
    .single()
  if (error) throw error
  return data as Trip
}
