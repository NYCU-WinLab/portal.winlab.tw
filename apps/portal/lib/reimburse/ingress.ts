import { createClient } from "@/lib/supabase/server"

import { fetchIngress } from "./fetch"
import { insertIngress, patchIngress } from "./mutations"
import type { DatabaseIngress, InsertIngress, UpdateIngress } from "./types"

const TABLE = "reimburse_ingress"

export async function getIngressList() {
  return fetchIngress(await createClient())
}

export async function getIngressById(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(`Failed to fetch ingress: ${error.message}`)
  return data as DatabaseIngress
}

export async function createIngress(payload: InsertIngress) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return insertIngress(supabase, { ...payload, user_id: user?.id ?? null })
}

export async function updateIngress(id: string, updates: UpdateIngress) {
  const row = await patchIngress(await createClient(), id, updates)
  if (!row) throw new Error("Failed to update ingress: no such entry")
  return row
}

export async function deleteIngress(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(`Failed to delete ingress: ${error.message}`)
}
