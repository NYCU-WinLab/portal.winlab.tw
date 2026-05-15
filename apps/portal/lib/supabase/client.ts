import { createBrowserClient } from "@supabase/ssr"

// Mirrors the exact UTF-8 validation that @supabase/supabase-js runs when it
// decodes a stored JWT. If a stored session contains bytes that fail this
// check the SDK throws "Invalid UTF-8 sequence" and the auth client is left
// in a broken state. We remove the offending keys before the SDK ever sees
// them so the user gets a clean login instead of a silent crash.
//
// Runs once per page load — `createBrowserClient` itself is a singleton, so
// the SDK side already dedupes. Re-scanning localStorage on every hook
// re-render is just wasted CPU.
let purged = false
function purgeCorruptedAuthStorageOnce() {
  if (purged) return
  purged = true
  if (typeof localStorage === "undefined") return
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true })

    function isValidB64Utf8(b64url: string): boolean {
      try {
        const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/")
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
        const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
        decoder.decode(bytes)
        return true
      } catch {
        return false
      }
    }

    Object.keys(localStorage)
      .filter(
        (k) =>
          k.startsWith("sb-") || k === "portal" || k === "portal-auth-token"
      )
      .forEach((k) => {
        try {
          const raw = localStorage.getItem(k)
          if (!raw) return
          const parsed = JSON.parse(raw)
          const token: unknown =
            parsed?.access_token ?? parsed?.currentSession?.access_token
          if (typeof token !== "string") return
          const parts = token.split(".")
          const header = parts[0]
          const payload = parts[1]
          if (
            parts.length !== 3 ||
            !header ||
            !payload ||
            !isValidB64Utf8(header) ||
            !isValidB64Utf8(payload)
          ) {
            localStorage.removeItem(k)
          }
        } catch {
          localStorage.removeItem(k)
        }
      })
  } catch {
    // Private browsing / SSR — nothing to do
  }
}

export function createClient() {
  purgeCorruptedAuthStorageOnce()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookieOptions: { name: "portal" } }
  )
}
