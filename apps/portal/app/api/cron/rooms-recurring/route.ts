import { NextResponse } from "next/server"

import { runRecurringBookings } from "@/lib/rooms/recurring-run"

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
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
