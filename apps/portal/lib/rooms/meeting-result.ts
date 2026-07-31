// Applies a finished meeting request: records it, then tells people.
//
// Shared by the callback route and the stuck-request sweep so that "the
// pipeline said it failed" and "the pipeline never came back" resolve to the
// same recorded state and the same notification.

import { render } from "@react-email/render"

import type { SupabaseClient } from "@supabase/supabase-js"

import { MeetingFailed } from "@/emails/rooms/meeting-failed"
import { getResend, MAIL_FROM_ROOMS } from "@/lib/email/resend"

import type { AttendeeContact } from "./attendee-groups"
import { nextInviteSequence } from "./book"
import { formatDayLabel, taipeiIso } from "./date"
import { sendBookingInvite } from "./invite-mail"
import {
  describeFailure,
  isRetryable,
  type MeetingOutcome,
} from "./meeting-callback"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export interface MeetingRequestRow {
  id: string
  request_id: string
  booking_id: string | null
  status: string
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

  if (outcome.kind === "success") {
    await admin
      .from("rooms_meeting_requests")
      .update({
        status: "success",
        stage: outcome.stage,
        join_url: outcome.joinUrl,
        web_link: outcome.webLink,
        event_id: outcome.eventId,
        thread_id: outcome.threadId,
        options_applied: outcome.optionsApplied,
        pipeline_id: outcome.pipeline.id,
        pipeline_url: outcome.pipeline.url,
        error_code: null,
        error_message: null,
        completed_at: completedAt,
      })
      .eq("id", request.id)

    return await resendInviteWithLink(admin, request, outcome.joinUrl)
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

  await notifyMeetingFailure(
    admin,
    request,
    describeFailure(outcome.errorCode, outcome.errorMessage),
    outcome.pipeline.url,
    isRetryable(outcome.errorCode)
  )
  return {}
}

type BookingRow = {
  id: string
  room: string
  date: string
  start_time: string
  end_time: string
  title: string | null
  attendees: unknown
  requested_by: string
}

async function loadBooking(
  admin: Admin,
  bookingId: string
): Promise<BookingRow | null> {
  const { data } = await admin
    .from("rooms_bookings")
    .select(
      "id, room, date, start_time, end_time, title, attendees, requested_by, status"
    )
    .eq("id", bookingId)
    .maybeSingle()
  // A booking cancelled while the pipeline was still running shouldn't get a
  // fresh invite mailed out after the cancellation.
  if (!data || data.status !== "booked") return null
  return data as BookingRow
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
 * Re-sends the calendar invite carrying the join link.
 *
 * Same UID as the original with a higher SEQUENCE, so Gmail and Outlook
 * update the event already in the recipient's calendar rather than adding a
 * second one. This is why the pipeline's own ical_uid is recorded but not
 * used — adopting it would orphan the invite that already went out.
 */
async function resendInviteWithLink(
  admin: Admin,
  request: MeetingRequestRow,
  joinUrl: string
): Promise<ApplyResult> {
  if (!request.booking_id) return {}

  const booking = await loadBooking(admin, request.booking_id)
  if (!booking) return {}

  const attendees = (booking.attendees ?? []) as AttendeeContact[]
  if (attendees.length === 0) return {}

  const organizer = await contactFor(admin, booking.requested_by)
  const sent = await sendBookingInvite({
    bookingId: booking.id,
    title: booking.title ?? `${booking.room} 借用`,
    room: booking.room,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    start: taipeiIso(booking.date, booking.start_time),
    end: taipeiIso(booking.date, booking.end_time),
    organizer,
    attendees,
    joinUrl,
    sequence: await nextInviteSequence(booking.id),
  })

  return sent.ok ? {} : { inviteError: sent.error }
}

/**
 * Tells whoever booked the room that there's no meeting link coming.
 *
 * Without this, a failed pipeline and a slow one look identical: the room is
 * booked, the invite went out, and the Teams link just never appears.
 */
async function notifyMeetingFailure(
  admin: Admin,
  request: MeetingRequestRow,
  reason: string,
  pipelineUrl: string | null,
  retryable: boolean
): Promise<void> {
  try {
    if (!request.booking_id) return
    const { data: booking } = await admin
      .from("rooms_bookings")
      .select("room, date, start_time, end_time, title, requested_by")
      .eq("id", request.booking_id)
      .maybeSingle()
    if (!booking) return

    const owner = await contactFor(admin, booking.requested_by)
    if (!owner.email) return

    const title = booking.title ?? `${booking.room} 借用`
    const html = await render(
      MeetingFailed({
        title,
        when: `${formatDayLabel(booking.date)} ${booking.start_time}–${booking.end_time}`,
        room: booking.room,
        reason,
        pipelineUrl,
        retryable,
      })
    )
    await getResend().emails.send({
      from: MAIL_FROM_ROOMS,
      to: owner.email,
      subject: `會議連結建立失敗:${title}`,
      html,
    })
    await admin
      .from("rooms_meeting_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("id", request.id)
  } catch (err) {
    // Already the failure path; the request row still records what happened.
    console.error("[rooms] meeting failure notice failed", err)
  }
}

/** How long a request may sit pending before it's treated as lost. */
export const STUCK_AFTER_MINUTES = 30

export interface SweepResult {
  checked: number
  timedOut: number
}

/**
 * Resolves requests the pipeline never reported back on.
 *
 * A crashed runner sends no callback at all, so without this a request stays
 * pending forever and the person who booked never learns the meeting link
 * isn't coming.
 */
export async function sweepStuckMeetingRequests(
  admin: Admin,
  now = new Date()
): Promise<SweepResult> {
  const cutoff = new Date(
    now.getTime() - STUCK_AFTER_MINUTES * 60_000
  ).toISOString()

  const { data, error } = await admin
    .from("rooms_meeting_requests")
    .select("id, request_id, booking_id, status")
    .eq("status", "pending")
    .lt("created_at", cutoff)
  if (error) throw new Error(`讀取待處理會議請求失敗:${error.message}`)

  const stuck = (data ?? []) as MeetingRequestRow[]
  for (const request of stuck) {
    await applyMeetingOutcome(admin, request, {
      kind: "failed",
      errorCode: "NO_CALLBACK",
      errorMessage: `pipeline 超過 ${STUCK_AFTER_MINUTES} 分鐘沒有回報結果`,
      stage: null,
      pipeline: { id: null, url: null },
    })
  }

  return { checked: stuck.length, timedOut: stuck.length }
}
