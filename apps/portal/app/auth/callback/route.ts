import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { clearStaleSupabaseCookies } from "@/lib/auth/clear-stale-cookies"
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

  // Exchange failed (or no code). Most common cause: stale cross-subdomain
  // Supabase cookies left behind by the previous portal at .winlab.tw. Clear
  // them and send the user back to /auth/login so one extra click gets them
  // through instead of a dead-end error page. First-failure users never see
  // /auth/auth-code-error again.
  const cookieStore = await cookies()
  await clearStaleSupabaseCookies(cookieStore)

  const retry = new URL("/auth/login", origin)
  retry.searchParams.set("stale", "1")
  return NextResponse.redirect(retry.toString())
}
