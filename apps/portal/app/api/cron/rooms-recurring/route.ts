import { NextResponse } from "next/server"

import { runRecurringBookings } from "@/lib/rooms/recurring-run"
import { sweepStuckMeetingRequests } from "@/lib/rooms/meeting-result"
import { createAdminClient } from "@/lib/supabase/admin"

// Books the next occurrence of every standing meeting, one week out. Runs
// daily rather than weekly so a single missed run only delays a booking by a
// day — and re-running is safe, since an occurrence already placed is
// skipped rather than booked twice.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  try {
    const result = await runRecurringBookings()
    // Backstop for meeting requests whose pipeline never called back. Daily
    // is coarse for a 30-minute timeout, but a pipeline that dies silently
    // has to surface eventually — the interactive path shows its own state
    // long before this runs.
    const meetings = await sweepStuckMeetingRequests(createAdminClient())
    return NextResponse.json({ ...result, meetings })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
