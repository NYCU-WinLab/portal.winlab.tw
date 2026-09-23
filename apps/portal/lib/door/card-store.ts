// door_cards reads. The client is a parameter because the callers build
// different ones: the page a cookie client, the MCP tool one carrying the
// caller's bearer token, the sync jobs the service-role client. RLS limits the
// first two to door admins, so callers gate the page on is_door_admin()
// themselves rather than reading "no rows" as "no cards".

import type { SupabaseClient } from "@supabase/supabase-js"

import type { DoorCardRow } from "@/lib/door/cards"

const COLUMNS =
  "card_id, holder_name, holder_user_id, note, sync_state, last_seen_at"

export async function listDoorCardRows(
  supabase: SupabaseClient,
  limit = 500
): Promise<DoorCardRow[]> {
  const { data, error } = await supabase
    .from("door_cards")
    .select(COLUMNS)
    .order("card_id", { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as DoorCardRow[]
}

export async function getDoorCardRow(
  supabase: SupabaseClient,
  cardId: string
): Promise<DoorCardRow | null> {
  const { data, error } = await supabase
    .from("door_cards")
    .select(COLUMNS)
    .eq("card_id", cardId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as DoorCardRow | null) ?? null
}
