import { NextResponse } from "next/server"

import { reconcileControllerCards } from "@/lib/door/sync"

// Compares door_cards against the access controller once a night and writes a
// door_card_changes row either way. The point is the drift nobody asked about:
// the 2026-09-21 corruption was found because members could not get in, and a
// nightly check is what turns that into a log line the morning after instead.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  try {
    const result = await reconcileControllerCards(null)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
