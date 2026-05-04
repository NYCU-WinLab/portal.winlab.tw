"use client"

import { useEffect } from "react"

// Nukes every local Supabase auth artefact. Mounted on /auth/login so any
// user arriving to sign in gets a clean slate — no ghost cookie, no stale
// localStorage session, no orphan sessionStorage flag. Mirror of portal's
// AuthStateReset, with gallery.winlab.tw added to the domain list because
// the same `.winlab.tw`-scoped ghost cookies poison this subdomain too.
//
// Why each piece matters:
// - localStorage: @supabase/ssr browser client stores session JSON here and
//   auto-refreshes on page mount. A stale entry spawns a refresh loop
//   (grant_type=refresh_token + over_request_rate_limit) that poisons IP
//   rate limits and can make exchangeCodeForSession fail with 429.
// - sessionStorage: @supabase/ssr occasionally puts PKCE scratch state
//   there. Clear for completeness.
// - document.cookie: our server-side clear handles this too, but JS can
//   only see & clear non-HttpOnly entries on the current domain. The old
//   portal set cookies with domain=.winlab.tw, so we blast that scope too
//   (writing a cookie with matching Domain and Max-Age=0 removes it).
export function AuthStateReset() {
  useEffect(() => {
    if (typeof window === "undefined") return

    const nukeStorage = (storage: Storage) => {
      for (let i = storage.length - 1; i >= 0; i--) {
        const key = storage.key(i)
        if (key?.startsWith("sb-")) storage.removeItem(key)
      }
    }

    try {
      nukeStorage(localStorage)
      nukeStorage(sessionStorage)
    } catch {
      // Safari private mode etc — nothing to do, carry on.
    }

    const domains: (string | undefined)[] = [
      undefined, // host-only current deployment
      ".winlab.tw", // old portal's explicit scope
      "portal.winlab.tw",
      "gallery.winlab.tw",
    ]
    for (const entry of document.cookie.split("; ")) {
      const name = entry.split("=")[0]
      if (!name?.startsWith("sb-")) continue
      for (const domain of domains) {
        const domainPart = domain ? `; domain=${domain}` : ""
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domainPart}`
      }
    }
  }, [])

  return null
}
