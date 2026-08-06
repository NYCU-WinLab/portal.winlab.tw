// The booking sequence itself, independent of who triggered it: a person
// clicking 確認預約, or the cron placing the next occurrence of a standing
// meeting. Both need identical behaviour — same external call, same audit
// row, same invite — so this is the one copy of it.
//
// Takes its Supabase client as an argument because those two callers need
// different ones: the request-scoped client for a person (RLS applies), the
// admin client for cron (no session to act under).

import type { SupabaseClient } from "@supabase/supabase-js"

import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/lib/supabase/database.types"
import type { AttendeeContact } from "./attendee-groups"
import { bookRoom } from "./booking-client"
import { fetchBusySlots } from "./client"
import { describeConflict, findConflict } from "./conflict"
import { taipeiIso } from "./date"
import { meetingJoinUrl, sendBookingInvite } from "./invite-mail"
import {
  meetingPipelineConfigured,
  triggerMeetingPipeline,
} from "./meeting-pipeline"

export interface PlaceBookingInput {
  date: string
  /** Null for an online-only meeting, which reserves nothing. */
  room: string | null
  startTime: string
  endTime: string
  title: string
  attendees: AttendeeContact[]
  organizer: { id: string; name: string; email: string }
  /** Set when this booking came from a standing meeting. */
  recurringId?: string
  /** Whether to ask the pipeline for a Teams meeting. */
  online?: boolean
  /** The machine-readable half of the Teams topic, e.g. `tasa`. */
  meetingPrefix?: string | null
  /** Keycloak group leaf, when the attendees came from a group button. */
  groupName?: string | null
  /** Free text: what the meeting is for. */
  agenda?: string | null
}

export interface PlaceBookingOutcome {
  bookingId: string
  /** Null for an online-only meeting — nothing was reserved. */
  externalId: string | null
  /** Set when a Teams meeting was requested; the link arrives by callback. */
  meetingRequestId?: string
  /** Present when the room was booked but the invite mail didn't go out. */
  inviteError?: string
}

/**
 * Reserves the next RFC 5545 SEQUENCE for a booking's calendar invite.
 *
 * Always on the admin client, never the caller's: `invite_sequence` is a
 * system-owned column that `authenticated` has no UPDATE grant on, because
 * the only update a person makes to a booking is cancelling it. Taking the
 * request-scoped client here would silently no-op under RLS and hand back a
 * sequence that was never stored.
 *
 * Read-then-write rather than an atomic increment: the three messages a
 * booking can send are inherently serial (invited on booking, updated when
 * the meeting link arrives, cancelled by a person), so there is nothing to
 * race with. Returns 1 if the row has vanished — a repeated 0 is the one
 * value that would make a client ignore the message.
 */
export async function nextInviteSequence(bookingId: string): Promise<number> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("rooms_bookings")
    .select("invite_sequence")
    .eq("id", bookingId)
    .maybeSingle()

  const next = (data?.invite_sequence ?? 0) + 1
  await admin
    .from("rooms_bookings")
    .update({ invite_sequence: next })
    .eq("id", bookingId)
  return next
}

export async function placeBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  subscriber: string,
  input: PlaceBookingInput
): Promise<PlaceBookingOutcome> {
  const start = taipeiIso(input.date, input.startTime)
  const end = taipeiIso(input.date, input.endTime)

  // An online-only meeting reserves nothing, so there is no external system
  // to call and no reservation id to record.
  let externalId: string | null = null
  if (input.room) {
    // Re-checked here rather than trusted from the grid the user clicked:
    // that grid is cached and can be well out of date, and booking on a stale
    // picture turns into a bare HTTP status from the dept system with no clue
    // which half-hour is the problem.
    const busy = await fetchBusySlots(input.room, input.date)
    const clash = findConflict(busy, input.room, start, end)
    if (clash) {
      throw new Error(
        describeConflict(
          input.room,
          { startTime: input.startTime, endTime: input.endTime },
          clash
        )
      )
    }

    externalId = await bookRoom({ room: input.room, start, end, subscriber })
  }

  const { data: inserted, error } = await supabase
    .from("rooms_bookings")
    .insert({
      external_reservation_id: externalId,
      room: input.room,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      requested_by: input.organizer.id,
      title: input.title,
      attendees: input.attendees as unknown as Json,
      recurring_id: input.recurringId ?? null,
      online: input.online ?? false,
      meeting_prefix: input.meetingPrefix ?? null,
      group_name: input.groupName ?? null,
      agenda: input.agenda ?? null,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    throw new Error(
      externalId
        ? `已在外部系統訂到教室(訂位編號 ${externalId}),但寫入 Portal 稽核紀錄失敗:${error?.message ?? "unknown"}——請通知管理員手動補登,避免之後被誤判成可取消`
        : `建立線上會議紀錄失敗:${error?.message ?? "unknown"}`
    )
  }

  // Trigger before mailing, so the request row exists by the time anyone can
  // follow the link in the invite. Nothing waits for the pipeline — it answers
  // minutes later on its own callback — and a trigger that fails must not undo
  // a room that's already reserved. The request row records the failure and
  // the daily sweep tells the creator.
  let meetingRequestId: string | undefined
  if (input.online && meetingPipelineConfigured()) {
    const triggered = await triggerMeetingPipeline(createAdminClient(), {
      bookingId: inserted.id,
      title: input.title,
      start,
      end,
      groupName: input.groupName,
      agenda: input.agenda,
    })
    meetingRequestId = triggered.requestId
  }

  // One message, sent once. The join link is Portal's own redirect rather
  // than the Teams URL, which doesn't exist yet — that's what removes the
  // second "here's the link now" mail everyone used to get.
  //
  // The room is booked either way, so a mail failure is reported back rather
  // than thrown: it must not read as "the booking didn't happen".
  const sent = await sendBookingInvite({
    bookingId: inserted.id,
    title: input.title,
    room: input.room,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    start,
    end,
    organizer: { name: input.organizer.name, email: input.organizer.email },
    attendees: input.attendees,
    joinUrl: input.online ? meetingJoinUrl(inserted.id) : null,
    // First message for this UID. The cancellation reads the stored counter
    // and bumps it.
    sequence: 0,
  })

  return {
    bookingId: inserted.id,
    externalId,
    ...(meetingRequestId ? { meetingRequestId } : {}),
    ...(sent.ok ? {} : { inviteError: sent.error }),
  }
}
