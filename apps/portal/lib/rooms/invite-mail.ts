import { render } from "@react-email/render"

import { BookingInvite } from "@/emails/rooms/booking-invite"
import { getResend, MAIL_FROM_ROOMS, siteUrl } from "@/lib/email/resend"

import { buildCalendarInvite } from "./ics"
import { formatDayLabel } from "./date"

export interface InviteRecipient {
  name: string
  email: string
}

export interface BookingInviteInput {
  bookingId: string
  title: string
  /** Null for an online-only meeting. */
  room: string | null
  date: string
  startTime: string
  endTime: string
  /** ISO 8601 instants matching startTime/endTime. */
  start: string
  end: string
  organizer: InviteRecipient
  attendees: InviteRecipient[]
  cancelled?: boolean
  /**
   * Where "join the meeting" points. This is Portal's own redirect, not the
   * Teams link — the invite goes out before the pipeline has produced one,
   * and a stable URL that resolves later is what lets this be the only
   * message anyone gets about the meeting.
   */
  joinUrl?: string | null
  /**
   * RFC 5545 SEQUENCE. Read from the booking rather than derived, because a
   * booking can be mailed three times now — invited, updated with the meeting
   * link, then cancelled — and repeating a sequence makes calendar clients
   * ignore the later message.
   */
  sequence: number
}

/** The stable link that resolves to the Teams meeting once there is one. */
export function meetingJoinUrl(bookingId: string): string {
  return `${siteUrl()}/api/rooms/join/${bookingId}`
}

/**
 * Who the invite actually goes to.
 *
 * The organiser is included even though they're the ORGANIZER rather than an
 * ATTENDEE in the .ics. Being named as organiser doesn't put the event in
 * your own calendar — the message has to reach you. Someone who booked a
 * meeting they aren't personally attending got nothing at all, and had no
 * copy of the meeting anywhere.
 */
export function recipients(input: BookingInviteInput): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const email of [
    input.organizer.email,
    ...input.attendees.map((a) => a.email),
  ]) {
    const key = email.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(email)
  }
  return out
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
  // A booking with no attendees still sends: the organiser gets their own
  // meeting. Only a booking with nobody to reach at all is a no-op.
  const to = recipients(input)
  if (to.length === 0) return { ok: true }

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
      sequence: input.sequence,
      method: cancelled ? "CANCEL" : "REQUEST",
      joinUrl: cancelled ? null : input.joinUrl,
    })

    const html = await render(
      BookingInvite({
        title: input.title,
        room: input.room,
        when,
        organizerName: input.organizer.name,
        attendeeNames: input.attendees.map((a) => a.name),
        cancelled,
        joinUrl: cancelled ? null : input.joinUrl,
      })
    )

    const { error } = await getResend().emails.send({
      from: MAIL_FROM_ROOMS,
      to,
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
