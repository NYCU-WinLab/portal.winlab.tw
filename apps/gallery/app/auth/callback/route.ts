import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { clearStaleSupabaseCookiesOnResponse } from "@/lib/auth/clear-stale-cookies"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // We deliberately do NOT honor a `?next=` query param here — passing it
  // through redirectTo trips Supabase's exact-match allow-list check and
  // causes the whole flow to fall back to Site URL (localhost). The
  // SignInButton stashes `next` in sessionStorage; a post-callback client
  // hop on `/` reads it and finishes navigation.

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error("[gallery/auth/callback] exchangeCodeForSession failed", {
        name: error.name,
        message: error.message,
        status: error.status,
      })
    }
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host")
      const isLocalEnv = process.env.NODE_ENV === "development"
      // Hand off to a tiny client landing page that consumes the stashed
      // `next` from sessionStorage and replaces the URL — keeps the deep
      // link working without ever putting it on the OAuth redirect.
      const target = "/auth/finish"
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${target}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${target}`)
      } else {
        return NextResponse.redirect(`${origin}${target}`)
      }
    }
  }

  // Failure path: most likely a ghost `sb-*` cookie from another .winlab.tw
  // subdomain poisoning PKCE state. Nuke them all and bounce to login.
  const retry = new URL("/auth/login", origin)
  retry.searchParams.set("stale", "1")
  const response = NextResponse.redirect(retry.toString())

  const cookieStore = await cookies()
  clearStaleSupabaseCookiesOnResponse(response, cookieStore)

  return response
}
