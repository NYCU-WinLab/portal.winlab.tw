import { render } from "@react-email/render"

import { createAdminClient } from "@/lib/supabase/admin"
import { getResend, MAIL_FROM, siteUrl } from "@/lib/email/resend"
import { SignerInvited } from "@/emails/approve/signer-invited"
import { DocumentCompleted } from "@/emails/approve/document-completed"

// Drains approve_email_outbox in a single pass. Called from two places:
//   1. Server Actions via next/server `after()` — fires right after the user's
//      submit response, so the invited mail shows up within seconds.
//   2. Vercel Cron once a day — a safety sweep for rows that `after()` missed
//      (function timeouts, Resend hiccups, whatever). Rows with attempts >= 5
//      are left alone so we can look at them by hand.

const BATCH = 50
const MAX_ATTEMPTS = 5

type OutboxRow = {
  id: string
  document_id: string
  recipient_id: string
  kind: "signer-invited" | "document-completed"
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
    .from("approve_email_outbox")
    .select("id,document_id,recipient_id,kind,attempts")
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
    const [docRes, recipientRes] = await Promise.all([
      admin
        .from("approve_documents")
        .select(
          "id,title,created_by,creator:user_profiles!approve_documents_created_by_fkey(name,email)"
        )
        .eq("id", row.document_id)
        .maybeSingle(),
      admin
        .from("user_profiles")
        .select("email,name")
        .eq("id", row.recipient_id)
        .maybeSingle(),
    ])
    if (docRes.error) throw new Error(`doc: ${docRes.error.message}`)
    if (recipientRes.error)
      throw new Error(`recipient: ${recipientRes.error.message}`)
    const doc = docRes.data
    const recipient = recipientRes.data
    if (!doc || !recipient?.email) {
      // Missing doc or email — not recoverable by retry; mark sent and move on.
      await admin
        .from("approve_email_outbox")
        .update({
          sent_at: new Date().toISOString(),
          last_error: "missing doc or recipient email",
        })
        .eq("id", row.id)
      return "skipped"
    }

    const creator = doc.creator as unknown as {
      name: string | null
      email: string | null
    } | null

    let subject: string
    let html: string
    let replyTo: string | undefined

    if (row.kind === "signer-invited") {
      subject = `請簽核：${doc.title}`
      html = await render(
        SignerInvited({
          documentTitle: doc.title,
          creatorName: creator?.name ?? creator?.email ?? "WinLab",
          signUrl: `${siteUrl()}/approve/sign/${doc.id}`,
        })
      )
      replyTo = creator?.email ?? undefined
    } else {
      const { data: signers, error: signersErr } = await admin
        .from("approve_signers")
        .select("user_profiles!approve_signers_signer_id_fkey(name,email)")
        .eq("document_id", doc.id)
      if (signersErr) throw new Error(`signers: ${signersErr.message}`)
      const signerNames = (signers ?? [])
        .map((s) => {
          const p = s.user_profiles as unknown as {
            name: string | null
            email: string | null
          } | null
          return p?.name ?? p?.email ?? "Unknown"
        })
        .filter(Boolean)
      subject = `已簽核完成：${doc.title}`
      html = await render(
        DocumentCompleted({
          documentTitle: doc.title,
          signerNames,
          viewUrl: `${siteUrl()}/approve/view/${doc.id}`,
        })
      )
    }

    const { error: sendErr } = await resend.emails.send({
      from: MAIL_FROM,
      to: recipient.email,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    })
    if (sendErr) throw new Error(sendErr.message)

    await admin
      .from("approve_email_outbox")
      .update({ sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id)
    return "sent"
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await admin
      .from("approve_email_outbox")
      .update({
        attempts: row.attempts + 1,
        last_error: message.slice(0, 500),
      })
      .eq("id", row.id)
    console.error("[approve-emails] send failed", { id: row.id, message })
    return "failed"
  }
}
