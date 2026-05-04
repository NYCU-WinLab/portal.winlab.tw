import { createClient } from "@/lib/supabase/server"

import type { DatabaseEgress, InsertEgress, UpdateEgress } from "./types"

const TABLE = "reimburse_egress"

export async function getEgressList() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("invoice_date", { ascending: false })

  if (error) throw new Error(`Failed to fetch egress: ${error.message}`)
  return (data ?? []) as DatabaseEgress[]
}

export async function getEgressById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(`Failed to fetch egress: ${error.message}`)
  return data as DatabaseEgress
}

export async function createEgress(payload: InsertEgress) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, user_id: user?.id ?? null })
    .select()
    .single()

  if (error) throw new Error(`Failed to create egress: ${error.message}`)
  return data as DatabaseEgress
}

export async function updateEgress(id: string, updates: UpdateEgress) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update egress: ${error.message}`)
  return data as DatabaseEgress
}

export async function deleteEgress(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(`Failed to delete egress: ${error.message}`)
}
