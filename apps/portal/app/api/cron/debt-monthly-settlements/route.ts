import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

// Generates the previous month's net-balance settlement rows. Idempotent via the
// (period, from_user_id, to_user_id) unique index — safe for retries.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase.rpc("debt_generate_monthly_settlements")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
