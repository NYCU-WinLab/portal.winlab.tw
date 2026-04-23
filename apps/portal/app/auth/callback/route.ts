import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { clearStaleSupabaseCookiesOnResponse } from "@/lib/auth/clear-stale-cookies"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  let next = searchParams.get("next") ?? "/"
  if (!next.startsWith("/")) {
    next = "/"
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host")
      const isLocalEnv = process.env.NODE_ENV === "development"
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // Failure path: most likely cause is a ghost `sb-*` cookie left over from
  // the previous portal at `.winlab.tw` scope poisoning @supabase/ssr's PKCE
  // state. Clear every sb-* cookie (including code-verifier — the current
  // round-trip has already failed, its verifier is worthless) on every
  // plausible domain and send the user back to login.
  const retry = new URL("/auth/login", origin)
  retry.searchParams.set("stale", "1")
  const response = NextResponse.redirect(retry.toString())

  const cookieStore = await cookies()
  clearStaleSupabaseCookiesOnResponse(response, cookieStore)

  return response
}
