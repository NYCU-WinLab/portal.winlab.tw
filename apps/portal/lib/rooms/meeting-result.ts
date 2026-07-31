// Applies a finished meeting request: records it, then tells people.
//
// Shared by the callback route and the stuck-request sweep so that "the
// pipeline said it failed" and "the pipeline never came back" resolve to the
// same recorded state and the same notification.

import { render } from "@react-email/render"

import type { SupabaseClient } from "@supabase/supabase-js"

import { MeetingFailed } from "@/emails/rooms/meeting-failed"
import { getResend, MAIL_FROM_ROOMS } from "@/lib/email/resend"

import { formatDayLabel } from "./date"
import {
  describeFailure,
  isRetryable,
  type MeetingAction,
  type MeetingOutcome,
} from "./meeting-callback"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export interface MeetingRequestRow {
  id: string
  request_id: string
  booking_id: string | null
  status: string
  kind: string
}

export interface ApplyResult {
  /** Set when the booking was updated but the follow-up mail didn't go out. */
  inviteError?: string
}

export async function applyMeetingOutcome(
  admin: Admin,
  request: MeetingRequestRow,
  outcome: MeetingOutcome
): Promise<ApplyResult> {
  const completedAt = new Date().toISOString()

  if (outcome.kind === "created") {
    await admin
      .from("rooms_meeting_requests")
      .update({
        status: "success",
        stage: outcome.stage,
        join_url: outcome.joinUrl,
        web_link: outcome.webLink,
        event_id: outcome.eventId,
        thread_id: outcome.threadId,
        // The pair the cancel pipeline needs handed back. Without them a
        // cancelled booking can only ever leave an orphan meeting behind.
        cancel_id: outcome.cancelId,
        message_id: outcome.messageId,
        options_applied: outcome.optionsApplied,
        pipeline_id: outcome.pipeline.id,
        pipeline_url: outcome.pipeline.url,
        error_code: null,
        error_message: null,
        completed_at: completedAt,
      })
      .eq("id", request.id)

    // No mail. The invite already went out with a link that resolves here,
    // so recording the URL is the whole job — re-sending would give everyone
    // a second message about a meeting already in their calendar.
    return {}
  }

  // A cancellation reports nothing but its status, and there's nobody to
  // tell: whoever cancelled is already looking at the result, and the
  // attendees got the CANCEL invite when the booking was cancelled.
  if (outcome.kind === "cancelled") {
    await admin
      .from("rooms_meeting_requests")
      .update({
        status: "success",
        stage: outcome.stage,
        pipeline_id: outcome.pipeline.id,
        pipeline_url: outcome.pipeline.url,
        error_code: null,
        error_message: null,
        completed_at: completedAt,
      })
      .eq("id", request.id)
    return {}
  }

  await admin
    .from("rooms_meeting_requests")
    .update({
      status: "failed",
      stage: outcome.stage,
      error_code: outcome.errorCode,
      error_message: outcome.errorMessage,
      pipeline_id: outcome.pipeline.id,
      pipeline_url: outcome.pipeline.url,
      completed_at: completedAt,
    })
    .eq("id", request.id)

  // Deliberately no mail here. Every failure notice goes out from the daily
  // sweep instead, so one meeting produces at most one message: a callback
  // that fails and a request that then times out would otherwise both write
  // to the same person about the same meeting.
  return {}
}

async function contactFor(
  admin: Admin,
  userId: string
): Promise<{ name: string; email: string }> {
  const { data } = await admin
    .from("user_profiles")
    .select("name, email")
    .eq("id", userId)
    .maybeSingle()
  return {
    name: data?.name ?? data?.email ?? "WinLab",
    email: data?.email ?? "",
  }
}

/**
 * Tells whoever booked the room that there's no meeting link coming.
 *
 * Without this, a failed pipeline and a slow one look identical: the room is
 * booked, the invite went out, and the Teams link just never appears.
 *
 * Marks the request notified only after the send succeeds, so a mail outage
 * means the next daily run tries again rather than swallowing the news.
 *
 * @returns whether a message actually went out.
 */
async function notifyMeetingFailure(
  admin: Admin,
  request: MeetingRequestRow,
  reason: string,
  pipelineUrl: string | null,
  retryable: boolean,
  action: MeetingAction
): Promise<boolean> {
  try {
    if (!request.booking_id) return false
    const { data: booking } = await admin
      .from("rooms_bookings")
      .select("room, date, start_time, end_time, title, requested_by, status")
      .eq("id", request.booking_id)
      .maybeSingle()
    if (!booking) return false

    // Nothing to act on once the booking is gone: there's no meeting to open
    // by hand and no room to keep. Mailing anyway is the noise this whole
    // batching change was meant to remove.
    if (booking.status !== "booked") {
      await admin
        .from("rooms_meeting_requests")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", request.id)
      return false
    }

    const owner = await contactFor(admin, booking.requested_by)
    if (!owner.email) return false

    const title = booking.title ?? `${booking.room} 借用`
    const html = await render(
      MeetingFailed({
        title,
        when: `${formatDayLabel(booking.date)} ${booking.start_time}–${booking.end_time}`,
        room: booking.room,
        reason,
        pipelineUrl,
        retryable,
        action,
      })
    )
    const { error } = await getResend().emails.send({
      from: MAIL_FROM_ROOMS,
      to: owner.email,
      subject:
        action === "cancel"
          ? `Teams 會議沒有取消成功:${title}`
          : `會議連結建立失敗:${title}`,
      html,
    })
    if (error) return false

    await admin
      .from("rooms_meeting_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", request.id)
    return true
  } catch (err) {
    // Already the failure path; the request row still records what happened.
    console.error("[rooms] meeting failure notice failed", err)
    return false
  }
}

/**
 * How long a request may sit pending before it's treated as lost.
 *
 * Doubles as the grace period the daily run needs: a booking made minutes
 * before the cron fires is still legitimately waiting for its pipeline, and
 * this cutoff is what stops it being declared dead on the spot. It just waits
 * for tomorrow's run instead.
 */
export const STUCK_AFTER_MINUTES = 30

export interface SweepResult {
  timedOut: number
  notified: number
}

/**
 * The one place failure mail goes out.
 *
 * Two jobs, in order. First resolve anything the pipeline never reported back
 * on — a crashed runner sends no callback at all, so without this a request
 * stays pending forever. Then mail every failure that hasn't been mailed yet,
 * whichever way it failed.
 *
 * Notifying from here rather than from the callback is what keeps it to one
 * message per meeting: a request that fails its callback and later times out
 * is still one meeting, and its owner should hear about it once.
 */
export async function sweepMeetingRequests(
  admin: Admin,
  now = new Date()
): Promise<SweepResult> {
  const cutoff = new Date(
    now.getTime() - STUCK_AFTER_MINUTES * 60_000
  ).toISOString()

  const { data: stale, error } = await admin
    .from("rooms_meeting_requests")
    .select("id, request_id, booking_id, status, kind")
    .eq("status", "pending")
    .lt("created_at", cutoff)
  if (error) throw new Error(`讀取待處理會議請求失敗:${error.message}`)

  const stuck = (stale ?? []) as MeetingRequestRow[]
  for (const request of stuck) {
    await applyMeetingOutcome(admin, request, {
      kind: "failed",
      // A lost cancellation and a lost creation need different words: one
      // leaves no meeting link, the other leaves a live meeting that will
      // still start and still record.
      action: request.kind === "cancel" ? "cancel" : "create",
      errorCode: "NO_CALLBACK",
      errorMessage: `pipeline 超過 ${STUCK_AFTER_MINUTES} 分鐘沒有回報結果`,
      stage: null,
      pipeline: { id: null, url: null },
    })
  }

  const { data: unnotified } = await admin
    .from("rooms_meeting_requests")
    .select(
      "id, request_id, booking_id, status, kind, error_code, error_message, pipeline_url"
    )
    .eq("status", "failed")
    .is("notified_at", null)

  let notified = 0
  for (const row of unnotified ?? []) {
    const code = row.error_code ?? "UNKNOWN"
    const sent = await notifyMeetingFailure(
      admin,
      {
        id: row.id,
        request_id: row.request_id,
        booking_id: row.booking_id,
        status: row.status,
        kind: row.kind,
      },
      describeFailure(code, row.error_message ?? ""),
      row.pipeline_url,
      isRetryable(code),
      row.kind === "cancel" ? "cancel" : "create"
    )
    if (sent) notified++
  }

  return { timedOut: stuck.length, notified }
}
