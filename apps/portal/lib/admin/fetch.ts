import type { SupabaseClient } from "@supabase/supabase-js"

export interface AdminUser {
  id: string
  name: string | null
  email: string
  is_admin: boolean
  roles: Record<string, string[]>
}

// portal_admin_get_users is SECURITY DEFINER and raises "permission denied"
// for anyone who is not a portal super admin, so a rejection arrives as an
// error rather than as an empty list.
export async function fetchAdminUsers(
  supabase: SupabaseClient
): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc("portal_admin_get_users")
  if (error) throw error
  return (data ?? []) as AdminUser[]
}
