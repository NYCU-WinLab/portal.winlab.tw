import { createClient } from "@/lib/supabase/server"

export async function isReceiptsAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("is_receipts_admin")
  if (error) {
    console.error("[receipts] is_receipts_admin rpc failed", error)
    return false
  }
  return data === true
}
