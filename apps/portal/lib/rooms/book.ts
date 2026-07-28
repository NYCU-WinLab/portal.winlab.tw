// The booking sequence itself, independent of who triggered it: a person
// clicking 確認預約, or the cron placing the next occurrence of a standing
// meeting. Both need identical behaviour — same external call, same audit
// row, same invite — so this is the one copy of it.
//
// Takes its Supabase client as an argument because those two callers need
// different ones: the request-scoped client for a person (RLS applies), the
// admin client for cron (no session to act under).

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Json } from "@/lib/supabase/database.types"
import type { AttendeeContact } from "./attendee-groups"
import { bookRoom } from "./booking-client"
import { taipeiIso } from "./date"
import { sendBookingInvite } from "./invite-mail"

export interface PlaceBookingInput {
  date: string
  room: string
  startTime: string
  endTime: string
  title: string
  attendees: AttendeeContact[]
  organizer: { id: string; name: string; email: string }
  /** Set when this booking came from a standing meeting. */
  recurringId?: string
}

export interface PlaceBookingOutcome {
  bookingId: string
  externalId: string
  /** Present when the room was booked but the invite mail didn't go out. */
  inviteError?: string
}

export async function placeBooking(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  subscriber: string,
  input: PlaceBookingInput
): Promise<PlaceBookingOutcome> {
  const start = taipeiIso(input.date, input.startTime)
  const end = taipeiIso(input.date, input.endTime)

  const externalId = await bookRoom({
    room: input.room,
    start,
    end,
    subscriber,
  })

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
    })
    .select("id")
    .single()

  if (error || !inserted) {
    throw new Error(
      `已在外部系統訂到教室(訂位編號 ${externalId}),但寫入 Portal 稽核紀錄失敗:${error?.message ?? "unknown"}——請通知管理員手動補登,避免之後被誤判成可取消`
    )
  }

  // The room is booked either way — a mail failure is reported back, not
  // thrown, so it can't read as "the booking didn't happen".
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
  })

  return {
    bookingId: inserted.id,
    externalId,
    ...(sent.ok ? {} : { inviteError: sent.error }),
  }
}
