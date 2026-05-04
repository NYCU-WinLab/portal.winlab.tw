import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config"

// Cookie-aware server client. Used by /oauth/callback to run
// exchangeCodeForSession — PKCE verifier was stashed in cookies by the
// browser client during signInWithOAuth.
//
// Per Fluid compute guidance: never cache this client globally. Build a
// fresh one per request.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component context — middleware will refresh on next request.
        }
      },
    },
  })
}
