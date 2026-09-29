import type { SupabaseClient } from "@supabase/supabase-js"

import type {
  DatabaseEgress,
  DatabaseIngress,
  InsertEgress,
  InsertIngress,
  UpdateEgress,
  UpdateIngress,
} from "./types"

// Client-param writes shared by the server actions (cookie client, via
// egress.ts / ingress.ts) and the MCP tools (per-request user client). RLS
// lets only is_reimburse_admin() write. An update or delete that matches no
// row, because the id is unknown or RLS hides it, comes back as null.

export async function insertEgress(
  supabase: SupabaseClient,
  payload: InsertEgress
): Promise<DatabaseEgress> {
  const { data, error } = await supabase
    .from("reimburse_egress")
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(`Failed to create egress: ${error.message}`)
  return data as DatabaseEgress
}

export async function patchEgress(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateEgress
): Promise<DatabaseEgress | null> {
  const { data, error } = await supabase
    .from("reimburse_egress")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) throw new Error(`Failed to update egress: ${error.message}`)
  return (data as DatabaseEgress | null) ?? null
}

export async function removeEgress(
  supabase: SupabaseClient,
  id: string
): Promise<DatabaseEgress | null> {
  const { data, error } = await supabase
    .from("reimburse_egress")
    .delete()
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) throw new Error(`Failed to delete egress: ${error.message}`)
  return (data as DatabaseEgress | null) ?? null
}

export async function insertIngress(
  supabase: SupabaseClient,
  payload: InsertIngress
): Promise<DatabaseIngress> {
  const { data, error } = await supabase
    .from("reimburse_ingress")
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(`Failed to create ingress: ${error.message}`)
  return data as DatabaseIngress
}

export async function patchIngress(
  supabase: SupabaseClient,
  id: string,
  updates: UpdateIngress
): Promise<DatabaseIngress | null> {
  const { data, error } = await supabase
    .from("reimburse_ingress")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) throw new Error(`Failed to update ingress: ${error.message}`)
  return (data as DatabaseIngress | null) ?? null
}
