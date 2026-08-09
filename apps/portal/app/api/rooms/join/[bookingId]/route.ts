// The "join the meeting" link that goes in the calendar invite.
//
// The invite has to be sent the moment the room is booked, but the Teams
// link doesn't exist until the pipeline finishes minutes later. So the invite
// carries this URL — stable, known immediately — and it redirects to the real
// one once there is one.
//
// That's what makes it a single email. The alternative was mailing the invite
// now and mailing it again with the link later, which meant everyone got two
// messages for one meeting.
//
// Deliberately under /api, which the auth proxy skips: attendees are invited
// on their Keycloak details alone and need no Portal account, so gating this
// behind a login would lock out exactly the people the invite was widened to
// include. The booking id is an unguessable uuid, and anyone holding this
// link would have been sent the Teams link directly under the old scheme —
// so this exposes nothing extra.

import { NextResponse } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function page(title: string, detail: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#0a0a0a;color:#fafafa;
       font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}
  main{max-width:32rem;padding:2rem;text-align:center;line-height:1.7}
  h1{font-size:1.125rem;font-weight:600;margin:0 0 .75rem}
  p{font-size:.875rem;color:#a3a3a3;margin:0}
</style></head>
<body><main><h1>${title}</h1><p>${detail}</p></main></body></html>`
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params

  const admin = createAdminClient()
  const { data: booking } = await admin
    .from("rooms_bookings")
    .select("id, title, status, online")
    .eq("id", bookingId)
    .maybeSingle()

  if (!booking) {
    return page("找不到這場會議", "連結可能已經失效,或是這筆預約不存在。", 404)
  }

  if (booking.status !== "booked") {
    return page("這場會議已經取消", "預約已被取消,線上會議也已經關閉。", 410)
  }

  // Checked before the request lookup: a booking that never asked for a Teams
  // meeting has no request row, which would otherwise read as "still being
  // created" — a wait that never ends.
  if (!booking.online) {
    return page(
      "這場預約沒有線上會議",
      "這筆預約只借了教室,沒有要開 Teams 會議。",
      404
    )
  }

  const { data: request } = await admin
    .from("rooms_meeting_requests")
    .select("status, join_url")
    .eq("booking_id", bookingId)
    .eq("kind", "create")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (request?.status === "success" && request.join_url) {
    // 302 rather than 307/308: this is a lookup that legitimately resolves
    // somewhere different over time, and nothing should cache it.
    return NextResponse.redirect(request.join_url, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    })
  }

  if (!request || request.status === "pending") {
    return page(
      "線上會議還在建立中",
      "通常一兩分鐘就好,稍後重新整理這個頁面即可。",
      202
    )
  }

  return page(
    "這場會議沒有線上會議連結",
    "自動建立 Teams 會議時失敗了,發起人已經收到通知。教室的預約不受影響。",
    409
  )
}
