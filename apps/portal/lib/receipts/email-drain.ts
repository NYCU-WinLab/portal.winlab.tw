import { render } from "@react-email/render"

import { createAdminClient } from "@/lib/supabase/admin"
import { getResend, siteUrl } from "@/lib/email/resend"
import { ReceiptUploaded } from "@/emails/receipts/receipt-uploaded"

// Drains receipts_email_outbox in a single pass. Called from two places:
//   1. The upload mutation via a Server Action that uses `after()` — fires
//      right after the user's upload response, so accounting sees the new
//      receipt within seconds.
//   2. Vercel Cron once a day — a safety sweep for rows that `after()` missed
//      (function timeouts, Resend hiccups, whatever). Rows with attempts >= 5
//      are left alone so we can look at them by hand.

// receipts use their own From identity (kept out of lib/email/resend.ts so the
// shared module stays single-purpose). Separate inbox folder rules / reply
// routing for accounting@ stay easy.
const MAIL_FROM_RECEIPTS = "WinLab Receipts <receipts@notifications.winlab.tw>"
const ACCOUNTING_EMAIL = "accounting@winlab.tw"

const BATCH = 50
const MAX_ATTEMPTS = 5

type OutboxRow = {
  id: string
  receipt_id: string
  kind: "receipt-uploaded"
  attempts: number
}

export type DrainResult = {
  picked: number
  sent: number
  failed: number
  skipped: number
}

export async function drainOutboxBatch(): Promise<DrainResult> {
  const admin = createAdminClient()
  const resend = getResend()

  const { data: rows, error } = await admin
    .from("receipts_email_outbox")
    .select("id,receipt_id,kind,attempts")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH)
  if (error) throw new Error(error.message)

  const result: DrainResult = {
    picked: rows?.length ?? 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  for (const row of (rows ?? []) as OutboxRow[]) {
    const outcome = await sendOne(admin, resend, row)
    result[outcome]++
  }
  return result
}

async function sendOne(
  admin: ReturnType<typeof createAdminClient>,
  resend: ReturnType<typeof getResend>,
  row: OutboxRow
): Promise<"sent" | "failed" | "skipped"> {
  try {
    const { data: receipt, error: receiptErr } = await admin
      .from("receipts")
      .select(
        "id,name,created_at,created_by,uploader:user_profiles!receipts_created_by_fkey(name,email)"
      )
      .eq("id", row.receipt_id)
      .maybeSingle()
    if (receiptErr) throw new Error(`receipt: ${receiptErr.message}`)
    if (!receipt) {
      // Receipt got deleted between enqueue and drain. Cascade should have
      // killed the outbox row, but be defensive — mark it sent so we don't
      // burn retries on something that no longer exists.
      await admin
        .from("receipts_email_outbox")
        .update({
          sent_at: new Date().toISOString(),
          last_error: "missing receipt",
        })
        .eq("id", row.id)
      return "skipped"
    }

    const uploader = receipt.uploader as unknown as {
      name: string | null
      email: string | null
    } | null
    // Legacy rows pre-trigger have null created_by, hence the WinLab fallback.
    const uploaderName = uploader?.name ?? uploader?.email ?? "WinLab"

    const uploadedAt = new Date(receipt.created_at).toLocaleString("zh-TW", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })

    const html = await render(
      ReceiptUploaded({
        receiptName: receipt.name,
        uploaderName,
        uploadedAt,
        viewUrl: `${siteUrl()}/receipts`,
      })
    )

    const { error: sendErr } = await resend.emails.send({
      from: MAIL_FROM_RECEIPTS,
      to: ACCOUNTING_EMAIL,
      subject: `新收據：${receipt.name}`,
      html,
    })
    if (sendErr) throw new Error(sendErr.message)

    await admin
      .from("receipts_email_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id)
    return "sent"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from("receipts_email_outbox")
      .update({
        attempts: row.attempts + 1,
        last_error: message.slice(0, 500),
      })
      .eq("id", row.id)
    console.error("[receipts-emails] send failed", { id: row.id, message })
    return "failed"
  }
}
