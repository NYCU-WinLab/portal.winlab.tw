import { createClient } from "@/lib/supabase/server"

export async function isPortalAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("is_portal_admin")
  if (error) {
    console.error("[admin] is_portal_admin rpc failed", error)
    return false
  }
  return data === true
}
