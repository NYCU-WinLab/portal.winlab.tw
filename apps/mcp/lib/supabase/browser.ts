import { createBrowserClient } from "@supabase/ssr"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

// Browser client for OAuth sign-in flow. PKCE verifier is stored in
// cookies so the server-side /oauth/callback route can later call
// exchangeCodeForSession.
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey)
}
