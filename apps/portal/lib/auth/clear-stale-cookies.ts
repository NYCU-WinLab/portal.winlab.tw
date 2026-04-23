import type { cookies } from "next/headers"

// The previous portal (old.portal.winlab.tw) set Supabase auth cookies with
// `domain: ".winlab.tw"` so they leaked across subdomains. This portal uses
// default host-only scope (portal.winlab.tw). When a user who logged in on
// the old portal hits this one, the browser sends BOTH the cross-subdomain
// ghost cookie AND any fresh host-only cookie under the same name —
// @supabase/ssr picks one value, fails to parse against the current PKCE
// state, and the callback falls through to /auth/auth-code-error.
//
// Nuking only the host-only version leaves the .winlab.tw ghost intact and
// the loop repeats. We have to Set-Cookie with the matching domain for the
// browser to drop it. We don't know every domain the old portal scoped to,
// so blast every plausible one — extra clears are harmless.
const DOMAINS_TO_CLEAR = [
  undefined, // host-only (current deployment)
  ".winlab.tw", // old portal's explicit scope
  "portal.winlab.tw",
]

export async function clearStaleSupabaseCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  const staleNames = cookieStore
    .getAll()
    .map((c) => c.name)
    // Session / auth-token cookies interfere with exchangeCodeForSession.
    // The code-verifier cookie is the one we JUST set for the PKCE round-trip
    // we're currently completing — don't touch it.
    .filter(
      (name) => name.startsWith("sb-") && !name.endsWith("-code-verifier")
    )

  for (const name of staleNames) {
    for (const domain of DOMAINS_TO_CLEAR) {
      cookieStore.set(name, "", {
        maxAge: 0,
        path: "/",
        ...(domain ? { domain } : {}),
      })
    }
  }

  return staleNames.length
}
