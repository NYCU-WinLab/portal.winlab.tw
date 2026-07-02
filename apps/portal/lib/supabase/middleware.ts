import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "./database.types"

// Ghost cookies from the old portal (domain=.winlab.tw) are sent by the
// browser to every *.winlab.tw subdomain alongside the correct host-only
// cookies. @supabase/ssr receives duplicate cookie names from getAll() and
// may pick the ghost value, producing a malformed JWT that can throw instead
// of returning a graceful error. Clear these on every response so they
// disappear after the user's first page load on any *.winlab.tw service.
const GHOST_COOKIE_DOMAINS = [".winlab.tw", "portal.winlab.tw"]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: "portal" },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.

  // getClaims() may throw (not just return error) when a ghost cookie's value
  // is in an old/unexpected format that @supabase/ssr can't parse. Without
  // this try-catch, that exception propagates through the middleware and Next.js
  // returns a 500 instead of redirecting to login.
  let user
  try {
    const { data } = await supabase.auth.getClaims()
    user = data?.claims
  } catch {
    // Treat any parse failure as unauthenticated — the /auth/login page and
    // the callback failure path both run clearStaleSupabaseCookiesOnResponse
    // which will finish the cleanup.
  }

  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  // Proactively sweep ghost cookies from every response. Users who haven't
  // visited /auth/login since the old portal was retired still carry
  // .winlab.tw-scoped sb-* cookies; clearing them here means they're gone
  // after the first successful page load rather than after the first login.
  for (const { name } of request.cookies.getAll()) {
    if (!name.startsWith("sb-")) continue
    for (const domain of GHOST_COOKIE_DOMAINS) {
      supabaseResponse.cookies.set(name, "", {
        maxAge: 0,
        path: "/",
        domain,
      })
    }
  }

  return supabaseResponse
}
