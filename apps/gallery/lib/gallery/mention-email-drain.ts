import { createAdminClient } from "@/lib/supabase/admin"
import { buildGalleryPhotoHref } from "@/lib/gallery/photo-deep-link"

const MAIL_FROM = "WinLab Gallery <gallery@notifications.winlab.tw>"
const BATCH_LIMIT = 40

type MentionRow = {
  comment_id: string
  mentioned_user_id: string
  gallery_comments: {
    id: string
    body: string
    created_at: string
    image_id: string
    gallery_images: { id: string; name: string } | null
    user_profiles: { name: string | null } | null
  } | null
  user_profiles: { name: string | null; email: string | null } | null
}

export type MentionEmailDrainResult = {
  scanned: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

function gallerySiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://gallery.winlab.tw"
}

async function sendResendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error("RESEND_API_KEY missing")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Resend ${response.status}: ${detail.slice(0, 240)}`)
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

export async function drainGalleryMentionEmails(): Promise<MentionEmailDrainResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("gallery_comment_mentions")
    .select(
      `
      comment_id,
      mentioned_user_id,
      gallery_comments!inner(
        id,
        body,
        created_at,
        image_id,
        gallery_images!inner(id, name),
        user_profiles!gallery_comments_created_by_fkey(name)
      ),
      user_profiles!gallery_comment_mentions_mentioned_user_id_fkey(name, email)
    `
    )
    .is("notified_at", null)
    .order("comment_id", { ascending: true })
    .limit(BATCH_LIMIT)

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as unknown as MentionRow[]
  const result: MentionEmailDrainResult = {
    scanned: rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const now = new Date().toISOString()
  const origin = gallerySiteUrl().replace(/\/$/, "")

  for (const row of rows) {
    const email = row.user_profiles?.email?.trim()
    const comment = row.gallery_comments
    if (!email || !comment?.image_id) {
      result.skipped += 1
      continue
    }

    const author = comment.user_profiles?.name?.trim() || "Someone"
    const imageName = comment.gallery_images?.name?.trim() || "a gallery work"
    const href = `${origin}${buildGalleryPhotoHref({
      photoId: comment.image_id,
      commentId: comment.id,
    })}`
    const preview = comment.body.trim().slice(0, 280)
    const subject = `${author} mentioned you on ${imageName}`

    try {
      await sendResendEmail({
        to: email,
        subject,
        text: `${author} mentioned you on "${imageName}".\n\n${preview}\n\nOpen: ${href}`,
        html: `
          <p><strong>${escapeHtml(author)}</strong> mentioned you on
          <strong>${escapeHtml(imageName)}</strong>.</p>
          <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #ccc;">
            ${escapeHtml(preview)}
          </blockquote>
          <p><a href="${escapeHtml(href)}">Open in Gallery</a></p>
        `,
      })

      const { error: markError } = await supabase
        .from("gallery_comment_mentions")
        .update({ notified_at: now })
        .eq("comment_id", row.comment_id)
        .eq("mentioned_user_id", row.mentioned_user_id)
        .is("notified_at", null)

      if (markError) {
        result.failed += 1
        result.errors.push(markError.message)
        continue
      }
      result.sent += 1
    } catch (err) {
      result.failed += 1
      result.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return result
}
