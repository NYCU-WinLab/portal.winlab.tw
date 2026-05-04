import { createClient } from "@/lib/supabase/server"

// Wraps the `is_reimburse_admin()` SQL helper. RPC keeps the role-resolution
// logic on one side (DB), so JS callers can't drift out of sync with RLS.
export async function isReimburseAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("is_reimburse_admin")
  if (error) {
    console.error("[reimburse] is_reimburse_admin rpc failed", error)
    return false
  }
  return data === true
}
