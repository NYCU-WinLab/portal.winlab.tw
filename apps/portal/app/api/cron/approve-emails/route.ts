import { NextResponse } from "next/server"

import { drainOutboxBatch } from "@/lib/email/drain-outbox"

// Daily safety-net sweep for approve_email_outbox. The happy path goes through
// `after()` in the submit Server Actions — this route only catches stragglers
// that failed their inline attempt (function timeout, Resend hiccup, etc.).

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  try {
    const result = await drainOutboxBatch()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
