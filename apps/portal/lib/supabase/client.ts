import { createBrowserClient } from "@supabase/ssr"

// Mirrors the exact UTF-8 validation that @supabase/supabase-js runs when it
// decodes a stored JWT. If a stored session contains bytes that fail this
// check the SDK throws "Invalid UTF-8 sequence" and the auth client is left
// in a broken state. We remove the offending keys before the SDK ever sees
// them so the user gets a clean login instead of a silent crash.
function purgeCorruptedAuthStorage() {
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
      .filter((k) => k.startsWith("sb-"))
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
  purgeCorruptedAuthStorage()
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
