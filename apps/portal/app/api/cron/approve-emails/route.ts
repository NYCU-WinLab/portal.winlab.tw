import { NextResponse } from "next/server"
import { render } from "@react-email/render"

import { createAdminClient } from "@/lib/supabase/admin"
import { getResend, MAIL_FROM, siteUrl } from "@/lib/email/resend"
import { SignerInvited } from "@/lib/email/templates/signer-invited"
import { DocumentCompleted } from "@/lib/email/templates/document-completed"

// Vercel Cron → GET /api/cron/approve-emails every minute.
// Drains the approve_email_outbox: fetches pending rows, sends via Resend,
// marks sent_at on success or bumps attempts with last_error on failure.

export const runtime = "nodejs"
// Never cache a cron endpoint — we want fresh DB reads every tick.
export const dynamic = "force-dynamic"

const BATCH = 50
const MAX_ATTEMPTS = 5

type OutboxRow = {
  id: string
  document_id: string
  recipient_id: string
  kind: "signer-invited" | "document-completed"
  attempts: number
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 })
  }

  const admin = createAdminClient()
  const resend = getResend()

  const { data: rows, error } = await admin
    .from("approve_email_outbox")
    .select("id,document_id,recipient_id,kind,attempts")
    .is("sent_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results = { sent: 0, failed: 0, skipped: 0 }

  for (const row of (rows ?? []) as OutboxRow[]) {
    const outcome = await sendOne(admin, resend, row)
    results[outcome]++
  }

  return NextResponse.json({ picked: rows?.length ?? 0, ...results })
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
          creatorName: creator?.name ?? creator?.email ?? "Portal",
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
