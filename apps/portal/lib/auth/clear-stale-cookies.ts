import type { NextResponse } from "next/server"
import type { cookies as nextCookies } from "next/headers"

// The previous portal scoped Supabase auth cookies to `.winlab.tw`, so users
// who logged in there carry cross-subdomain ghost cookies on this portal
// (host-only). Both values collide in the browser's Cookie header under the
// same name; @supabase/ssr picks one, the PKCE verifier / session reconciles
// wrong, exchangeCodeForSession fails.
//
// First attempt at a fix (PR #15) preserved `-code-verifier` cookies on the
// theory that we'd need the current round-trip's verifier. In practice the
// GHOST verifier at `.winlab.tw` was the exact thing poisoning the exchange —
// preserving verifiers meant the ghost survived and the loop continued.
//
// New policy: on failure, nuke EVERY `sb-*` cookie on every plausible domain
// scope. The current attempt's verifier dies with the ghost, but that's
// fine — the current attempt has already failed. The next click starts
// fresh and succeeds.
const DOMAINS_TO_CLEAR = [
  undefined, // host-only (current deployment)
  ".winlab.tw", // old portal's explicit scope
  "portal.winlab.tw",
]

export function clearStaleSupabaseCookiesOnResponse(
  response: NextResponse,
  cookieStore: Awaited<ReturnType<typeof nextCookies>>
) {
  const staleNames = cookieStore
    .getAll()
    .map((c) => c.name)
    .filter((name) => name.startsWith("sb-"))

  for (const name of staleNames) {
    for (const domain of DOMAINS_TO_CLEAR) {
      response.cookies.set(name, "", {
        maxAge: 0,
        path: "/",
        ...(domain ? { domain } : {}),
      })
    }
  }

  return staleNames.length
}
