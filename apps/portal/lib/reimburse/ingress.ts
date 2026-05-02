import { createClient } from "@/lib/supabase/server"

import type { DatabaseIngress, InsertIngress, UpdateIngress } from "./types"

const TABLE = "reimburse_ingress"

export async function getIngressList() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("ingress_date", { ascending: false })

  if (error) throw new Error(`Failed to fetch ingress: ${error.message}`)
  return (data ?? []) as DatabaseIngress[]
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

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...payload, user_id: user?.id ?? null })
    .select()
    .single()

  if (error) throw new Error(`Failed to create ingress: ${error.message}`)
  return data as DatabaseIngress
}

export async function updateIngress(id: string, updates: UpdateIngress) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update ingress: ${error.message}`)
  return data as DatabaseIngress
}

export async function deleteIngress(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from(TABLE).delete().eq("id", id)
  if (error) throw new Error(`Failed to delete ingress: ${error.message}`)
}
