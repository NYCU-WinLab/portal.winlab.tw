import type { SupabaseClient } from "@supabase/supabase-js"

import type { DatabaseEgress, DatabaseIngress } from "./types"

// Client-param reads shared by the server pages (cookie client, via
// egress.ts / ingress.ts) and the MCP tools (per-request user client). Every
// signed-in member may select the whole ledger; writing needs
// is_reimburse_admin().
export async function fetchEgress(
  supabase: SupabaseClient
): Promise<DatabaseEgress[]> {
  const { data, error } = await supabase
    .from("reimburse_egress")
    .select("*")
    .order("invoice_date", { ascending: false })

  if (error) throw new Error(`Failed to fetch egress: ${error.message}`)
  return (data ?? []) as DatabaseEgress[]
}

export async function fetchIngress(
  supabase: SupabaseClient
): Promise<DatabaseIngress[]> {
  const { data, error } = await supabase
    .from("reimburse_ingress")
    .select("*")
    .order("ingress_date", { ascending: false })

  if (error) throw new Error(`Failed to fetch ingress: ${error.message}`)
  return (data ?? []) as DatabaseIngress[]
}
