import { createClient } from "@supabase/supabase-js"

// Service-role client. Bypasses RLS — only use from trusted server-only code.
// Never expose this client to the browser.
// Fluid compute warning: don't cache this in a module global across requests.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    throw new Error("Missing Supabase admin credentials.")
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
