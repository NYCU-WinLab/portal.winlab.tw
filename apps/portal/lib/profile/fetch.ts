import type { SupabaseClient } from "@supabase/supabase-js"

import type { ProfileStats } from "@/lib/profile/stats"

// get_profile_stats is SECURITY DEFINER but answers null unless auth.uid()
// equals p_user_id, so the caller's own id is the only argument that returns
// anything. Null means "no stats", not "no permission" — both look the same.
export async function fetchProfileStats(
  supabase: SupabaseClient,
  userId: string
): Promise<ProfileStats | null> {
  const { data, error } = await supabase.rpc("get_profile_stats", {
    p_user_id: userId,
  })
  if (error) throw error
  return (data ?? null) as ProfileStats | null
}
