import "server-only"

import { createClient } from "@/lib/supabase/server"

export class IpUserAccessError extends Error {}

export async function requireIpUserAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) throw new IpUserAccessError("請先登入")
  const { data, error } = await supabase.rpc("is_portal_admin")
  if (error || data !== true)
    throw new IpUserAccessError("僅限 Portal 總管使用")
  return supabase
}
