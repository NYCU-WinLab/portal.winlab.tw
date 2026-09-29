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

export async function fetchEgressById(
  supabase: SupabaseClient,
  id: string
): Promise<DatabaseEgress | null> {
  const { data, error } = await supabase
    .from("reimburse_egress")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) throw new Error(`Failed to fetch egress: ${error.message}`)
  return (data as DatabaseEgress | null) ?? null
}

// The names the /reimburse applicant picker offers: every member who has one.
export async function fetchApplicantNames(
  supabase: SupabaseClient
): Promise<string[]> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("name")
    .order("name")

  if (error) throw new Error(`Failed to fetch lab members: ${error.message}`)
  return ((data ?? []) as { name: string | null }[])
    .map((row) => row.name)
    .filter((name): name is string => !!name)
}
