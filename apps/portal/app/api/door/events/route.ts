import { NextResponse } from "next/server"

import {
  buildCardDoorEvent,
  cardIngestAuthorized,
  CardEventInputError,
  readCardSwipes,
} from "@/lib/door/card-events"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const secret = process.env.HAMS_EVENTS_SECRET
  if (!secret || secret.length < 32) {
    console.error("[door] card event ingest is not configured")
    return NextResponse.json({ error: "not configured" }, { status: 503 })
  }
  if (!cardIngestAuthorized(request.headers.get("authorization"), secret)) {
    console.warn("[door] unauthorized card event ingest")
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let events
  try {
    events = await readCardSwipes(request)
  } catch (error) {
    if (!(error instanceof CardEventInputError)) throw error
    console.warn("[door] invalid card event batch", error.message)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // The dedicated bridge credential only reaches this bounded audit insert;
  // it never grants card-management or physical door-control operations.
  const supabase = createAdminClient()
  const { data: holders, error: holderError } = await supabase
    .from("door_cards")
    .select("card_id, holder_name, holder_user_id, updated_at")
    .in("card_id", [...new Set(events.map((event) => event.card_id))])
  if (holderError) {
    console.error("[door] card holder lookup failed", holderError.code)
    return NextResponse.json({ error: "holder lookup failed" }, { status: 503 })
  }
  const byCard = new Map(
    (holders ?? []).map((holder) => [holder.card_id, holder])
  )
  const rows = events.map((event) =>
    buildCardDoorEvent(event, byCard.get(event.card_id))
  )
  const { error } = await supabase.from("door_events").upsert(rows, {
    onConflict: "source_event_id",
    ignoreDuplicates: true,
  })
  if (error) {
    console.error("[door] card event insert failed", error.code)
    return NextResponse.json({ error: "event insert failed" }, { status: 503 })
  }
  return NextResponse.json({
    accepted: events.map((event) => event.event_id),
  })
}
