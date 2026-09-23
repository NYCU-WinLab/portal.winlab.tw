import { after, NextResponse } from "next/server"

import {
  buildCardDoorEvent,
  cardIngestAuthorized,
  CardEventInputError,
  pickCardGreeting,
  readCardSwipes,
} from "@/lib/door/card-events"
import { greetOnPanel } from "@/lib/door/greet"
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
  // With ignoreDuplicates the returned rows are exactly the ones this request
  // inserted, which is what tells a fresh swipe from a replayed delivery.
  const { data: inserted, error } = await supabase
    .from("door_events")
    .upsert(rows, { onConflict: "source_event_id", ignoreDuplicates: true })
    .select("source_event_id")
  if (error) {
    console.error("[door] card event insert failed", error.code)
    return NextResponse.json({ error: "event insert failed" }, { status: 503 })
  }
  scheduleGreeting(
    pickCardGreeting(
      events,
      byCard,
      new Set(
        (inserted ?? []).flatMap((row: { source_event_id: unknown }) =>
          typeof row.source_event_id === "string" ? [row.source_event_id] : []
        )
      )
    )
  )
  return NextResponse.json({
    accepted: events.map((event) => event.event_id),
  })
}

// The panel is cosmetic: it runs after the receipt goes out, and nothing about
// it may change the receipt, since the bridge only marks events delivered on
// an exact 200.
function scheduleGreeting(greeting: ReturnType<typeof pickCardGreeting>) {
  if (!greeting) return
  try {
    after(() => greetOnPanel(greeting))
  } catch (err) {
    console.error("[door] card greeting not scheduled", err)
  }
}
