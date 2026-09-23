import { createClient } from "@supabase/supabase-js"

// Service-role client. Bypasses RLS — only use from trusted server-only code
// (cron workers, webhooks). Never expose this client to the browser.
// Fluid compute warning: don't cache this in a module global across requests.
//
// `signal` bounds every request the client makes, for callers that go through
// shared query builders and so cannot chain .abortSignal() themselves. An
// abort is an AbortError, which postgrest-js does not retry.
export function createAdminClient(options: { signal?: AbortSignal } = {}) {
  const { signal } = options
  const bounded =
    signal &&
    Object.assign(
      (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, signal])
            : signal,
        }),
      { preconnect: fetch.preconnect }
    )
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      ...(bounded && { global: { fetch: bounded } }),
    }
  )
}
