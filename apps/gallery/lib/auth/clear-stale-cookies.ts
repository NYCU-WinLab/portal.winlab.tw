import type { NextResponse } from "next/server"
import type { cookies as nextCookies } from "next/headers"

// Same disease as portal: any user who already signed into portal.winlab.tw
// (host-only) or the legacy `.winlab.tw`-scoped portal carries `sb-*` ghost
// cookies that the browser merges with our own when they land on
// gallery.winlab.tw. Two values share a name; @supabase/ssr picks one,
// PKCE verifier reconciles wrong, exchangeCodeForSession fails — and
// Supabase's own retry path can fall back to Site URL, which is what put
// the `?code=` on localhost in the first place.
//
// Policy on callback failure: nuke every `sb-*` cookie on every plausible
// scope. The current attempt's verifier dies with the ghosts, but the
// current attempt has already failed — next click starts fresh.
const DOMAINS_TO_CLEAR = [
  undefined, // host-only (current deployment)
  ".winlab.tw", // old portal's explicit scope, still poisoning subdomains
  "portal.winlab.tw",
  "gallery.winlab.tw",
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
