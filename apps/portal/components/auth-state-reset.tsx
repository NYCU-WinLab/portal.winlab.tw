"use client"

import { useEffect } from "react"

// Nukes every local Supabase auth artefact. Mounted on /auth/login so any
// user arriving to sign in gets a clean slate — no ghost cookie, no stale
// localStorage session, no orphan sessionStorage flag.
//
// Why each piece matters:
// - localStorage: @supabase/ssr browser client stores session JSON here and
//   auto-refreshes on page mount. A stale entry here spawns a refresh loop
//   (visible as grant_type=refresh_token + over_request_rate_limit in
//   Supabase auth logs) that poisons the user's IP rate limit and can make
//   a subsequent exchangeCodeForSession fail with 429.
// - sessionStorage: less critical but @supabase/ssr occasionally puts PKCE
//   scratch state there. Clear for completeness.
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
