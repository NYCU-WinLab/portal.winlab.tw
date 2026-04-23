import { createClient as createSupabaseClient } from "@supabase/supabase-js"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

// Client with a user's Supabase access token in the Authorization header.
// RLS sees auth.uid() = the user bound to that token. Used by the /mcp
// endpoint after validating the bearer token.
export function createClientWithToken(accessToken: string) {
  return createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

// Service-role client. Bypasses RLS. Not used by MCP tools directly — kept
// here for future admin-side tasks (e.g. batch jobs).
export function createServiceClient() {
  return createSupabaseClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
