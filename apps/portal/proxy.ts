import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // API routes handle their own auth (cron endpoints use CRON_SECRET, not
    // Supabase cookies), so exclude /api to keep the proxy off the hot path
    // for machine-to-machine requests.
    // A .webmanifest is public metadata (name, icons, start_url) and has to
    // stay readable without a session: a browser refetches it when it decides
    // whether an app is installable and when it launches an installed one,
    // both of which can happen with an empty cookie jar. Gating it would hand
    // those fetches a redirect to HTML and silently cost /door its standalone
    // launch. lib/door/install.test.ts holds this line to its behaviour.
    "/((?!api|\\.well-known|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
}
