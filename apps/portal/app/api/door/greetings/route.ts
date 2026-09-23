import { NextResponse } from "next/server"

import {
  buildGreetingColorMap,
  buildGreetingSuffixMap,
  greetingsAuthorized,
  type GreetingCardHolder,
  type GreetingProfile,
} from "@/lib/door/greetings"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }
const QUERY_TIMEOUT_MS = 5000

// Read by the door panel service with the DISPLAY_API_SECRET it already
// shares with Portal. Service role, read only, a few columns of two tables.
// Returns {"suffix": {name: suffix}, "color": {name: "#rrggbb"}}, both keyed
// the same way; a member appears in a map only when they set that value.
export async function GET(request: Request) {
  const secret = process.env.DISPLAY_API_SECRET
  if (!secret || secret.length < 32) {
    console.error("[door] greetings endpoint is not configured")
    return NextResponse.json(
      { error: "not configured" },
      { status: 503, headers: NO_STORE }
    )
  }
  if (!greetingsAuthorized(request.headers.get("authorization"), secret)) {
    console.warn("[door] unauthorized greetings read")
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE }
    )
  }

  // A plain abort() plus retry(false): postgrest-js retries a GET that fails
  // with anything else, including AbortSignal.timeout()'s TimeoutError.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)
  try {
    const supabase = createAdminClient()
    const profiles = await supabase
      .from("user_profiles")
      .select("id, name, door_greeting_suffix, door_greeting_color")
      .or("door_greeting_suffix.not.is.null,door_greeting_color.not.is.null")
      .abortSignal(controller.signal)
      .retry(false)
    if (profiles.error) {
      console.error("[door] greetings profile read failed", profiles.error.code)
      return NextResponse.json(
        { error: "read failed" },
        { status: 503, headers: NO_STORE }
      )
    }
    const rows = (profiles.data ?? []) as GreetingProfile[]

    let cards: GreetingCardHolder[] = []
    if (rows.length > 0) {
      const holders = await supabase
        .from("door_cards")
        .select("holder_name, holder_user_id")
        .in(
          "holder_user_id",
          rows.map((row) => row.id)
        )
        .abortSignal(controller.signal)
        .retry(false)
      if (holders.error) {
        console.error("[door] greetings card read failed", holders.error.code)
        return NextResponse.json(
          { error: "read failed" },
          { status: 503, headers: NO_STORE }
        )
      }
      cards = (holders.data ?? []) as GreetingCardHolder[]
    }

    return NextResponse.json(
      {
        suffix: buildGreetingSuffixMap(rows, cards),
        color: buildGreetingColorMap(rows, cards),
      },
      { headers: NO_STORE }
    )
  } catch (err) {
    console.error("[door] greetings read failed", err)
    return NextResponse.json(
      { error: "read failed" },
      { status: 503, headers: NO_STORE }
    )
  } finally {
    clearTimeout(timer)
  }
}
