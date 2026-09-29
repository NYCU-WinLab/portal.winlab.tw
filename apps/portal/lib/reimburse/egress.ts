import { createClient } from "@/lib/supabase/server"

import { fetchEgress } from "./fetch"
import { insertEgress, patchEgress, removeEgress } from "./mutations"
import type { DatabaseEgress, InsertEgress, UpdateEgress } from "./types"

const TABLE = "reimburse_egress"

export async function getEgressList() {
  return fetchEgress(await createClient())
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
  return insertEgress(supabase, { ...payload, user_id: user?.id ?? null })
}

export async function updateEgress(id: string, updates: UpdateEgress) {
  const row = await patchEgress(await createClient(), id, updates)
  if (!row) throw new Error("Failed to update egress: no such entry")
  return row
}

export async function deleteEgress(id: string) {
  await removeEgress(await createClient(), id)
}
