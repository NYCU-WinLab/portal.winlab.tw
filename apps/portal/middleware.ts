import { type NextRequest } from "next/server"

import { updateSession } from "@/lib/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    // API routes handle their own auth (cron endpoints use CRON_SECRET, not
    // Supabase cookies), so exclude /api to keep the middleware off the hot
    // path for machine-to-machine requests.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
