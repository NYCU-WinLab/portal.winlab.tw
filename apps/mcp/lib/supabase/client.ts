import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

// Anonymous client for public endpoints (dynamic client registration, etc).
// No auth context — RLS sees the anon role.
export const createClient = () =>
  createSupabaseClient(supabaseUrl, supabasePublishableKey)
