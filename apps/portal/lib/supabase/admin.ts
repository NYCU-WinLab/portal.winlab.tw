import { createClient } from "@supabase/supabase-js"

// Service-role client. Bypasses RLS — only use from trusted server-only code
// (cron workers, webhooks). Never expose this client to the browser.
// Fluid compute warning: don't cache this in a module global across requests.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
