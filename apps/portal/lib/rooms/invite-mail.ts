import { render } from "@react-email/render"

import { BookingInvite } from "@/emails/rooms/booking-invite"
import { getResend, MAIL_FROM_ROOMS } from "@/lib/email/resend"

import { buildCalendarInvite } from "./ics"
import { formatDayLabel } from "./date"

export interface InviteRecipient {
  name: string
  email: string
}

export interface BookingInviteInput {
  bookingId: string
  title: string
  room: string
  date: string
  startTime: string
  endTime: string
  /** ISO 8601 instants matching startTime/endTime. */
  start: string
  end: string
  organizer: InviteRecipient
  attendees: InviteRecipient[]
  cancelled?: boolean
}

/**
 * Mails the attendees a calendar invite (or cancellation) for a booking.
 *
 * Deliberately not throwing on send failure: the room is already booked in
 * the external system by the time this runs, and failing the whole action
 * over a mail hiccup would leave the user thinking the booking didn't
 * happen. Returns what went wrong instead so the caller can surface it.
 */
export async function sendBookingInvite(
  input: BookingInviteInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.attendees.length === 0) return { ok: true }

  const when = `${formatDayLabel(input.date)} ${input.startTime}–${input.endTime}`
  const cancelled = input.cancelled ?? false

  try {
    const ics = buildCalendarInvite({
      // Stable across the REQUEST and its later CANCEL, which is what lets
      // a recipient's calendar match the two up and remove the event.
      uid: `rooms-${input.bookingId}@portal.winlab.tw`,
      title: input.title,
      room: input.room,
      start: input.start,
      end: input.end,
      organizer: input.organizer,
      attendees: input.attendees,
      sequence: cancelled ? 1 : 0,
      method: cancelled ? "CANCEL" : "REQUEST",
    })

    const html = await render(
      BookingInvite({
        title: input.title,
        room: input.room,
        when,
        organizerName: input.organizer.name,
        attendeeNames: input.attendees.map((a) => a.name),
        cancelled,
      })
    )

    const { error } = await getResend().emails.send({
      from: MAIL_FROM_ROOMS,
      to: input.attendees.map((a) => a.email),
      // RSVPs go back to whoever made the booking — a real mailbox, unlike
      // the notifications sender.
      replyTo: input.organizer.email,
      subject: `${cancelled ? "會議已取消" : "會議邀請"}：${input.title}（${when}）`,
      html,
      attachments: [
        {
          filename: "invite.ics",
          content: Buffer.from(ics, "utf8").toString("base64"),
          contentType: `text/calendar; charset=utf-8; method=${cancelled ? "CANCEL" : "REQUEST"}`,
        },
      ],
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" }
  }
}
