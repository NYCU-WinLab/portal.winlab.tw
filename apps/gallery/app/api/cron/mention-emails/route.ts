import { NextResponse } from "next/server"

import { drainGalleryMentionEmails } from "@/lib/gallery/mention-email-drain"

// Periodic drain for gallery @mention emails. Keep /api/mentions/* for
// manual / Apps Script drains; this cron is the built-in path.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  try {
    const result = await drainGalleryMentionEmails()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
