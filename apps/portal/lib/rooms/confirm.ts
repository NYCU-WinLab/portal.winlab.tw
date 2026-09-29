// Booking and cancelling a room, for whoever asks: a member on /rooms (the
// server actions, with the cookie client) or an agent (the MCP route, with
// the caller's bearer client). Both go through the lab's shared account on
// the dept system and the service-role pipeline trigger, so this module is
// server only and never imported by a tool module; the MCP route reaches it
// through a hook.

import type { SupabaseClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

import { fetchEpic, fetchEpicDeliverables } from "@/lib/gitlab/client"
import type { AttendeeContact } from "@/lib/rooms/attendee-groups"
import { nextInviteSequence, placeBooking } from "@/lib/rooms/book"
import { cancelRoomBooking } from "@/lib/rooms/booking-client"
import { validateBookingTimes } from "@/lib/rooms/booking-times"
import { taipeiIso } from "@/lib/rooms/date"
import { sanitizeDeliverables } from "@/lib/rooms/deliverables"
import { parseEpicRef } from "@/lib/rooms/epic-refs"
import { DAY_WINDOW } from "@/lib/rooms/fetch"
import { sendBookingInvite } from "@/lib/rooms/invite-mail"
import { gitlabPathForGroup } from "@/lib/rooms/keycloak-groups"
import {
  meetingPipelineConfigured,
  triggerMeetingCancel,
} from "@/lib/rooms/meeting-pipeline"
import { composeTopic, topicPrefix } from "@/lib/rooms/meeting-topic"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Database } from "@/lib/supabase/database.types"

/** The member a booking is made or cancelled for. */
export type BookingUser = { id: string; name: string; email: string | null }

export function requireServiceAccount(): string {
  const user = process.env.MEETINGROOM_SERVICE_USER
  if (!user) {
    throw new Error("自動預約尚未設定服務帳號(MEETINGROOM_SERVICE_USER)")
  }
  return user
}

/**
 * What a booking's chosen epics actually are, and what they say this meeting
 * owes.
 *
 * Both halves are resolved from GitLab rather than taken from the form. The
 * references are pinned to the group being booked under — a reference to
 * anything else is dropped rather than forwarded, since it would put a marker
 * comment on some other project's epic. The deliverables then come from the
 * issues linked under those epics, because the epic is the meeting and owes
 * nothing itself. An ad-hoc meeting has no epic and therefore none.
 *
 * Never throws. A GitLab outage costs the booking its epic link, not the
 * room — the pipeline's fallback for a booking with no ISSUE_REFS is to open
 * a standalone epic, which is recoverable by hand.
 */
export async function resolveEpicLink(
  groupName: string | null | undefined,
  requested: readonly string[]
): Promise<{ issueRefs: string[]; deliverables: string[] }> {
  const empty = { issueRefs: [], deliverables: [] }
  if (requested.length === 0) return empty

  const groupPath = await gitlabPathForGroup(groupName)
  if (!groupPath) return empty

  const refs = requested
    .map((raw) => parseEpicRef(raw, groupPath))
    .filter((ref) => ref !== null)
    .filter((ref) => ref.groupPath === groupPath)

  if (refs.length === 0) return empty

  // Confirms each epic exists and is readable before it's stored. An epic
  // that comes back null is dropped rather than failing the booking — the
  // marker is worth losing, the room isn't.
  const epics = (
    await Promise.all(refs.map((ref) => fetchEpic(groupPath, ref.iid)))
  ).filter((epic) => epic !== null)

  // A failed read leaves the booking's deliverables empty rather than
  // stopping it. The epic link is the part that matters and it survives; the
  // labels are a summary that GitLab can restate later.
  const deliverables = await Promise.all(
    epics.map((epic) => fetchEpicDeliverables(groupPath, epic.iid))
  )

  return {
    issueRefs: epics.map((epic) => `${groupPath}&${epic.iid}`),
    // Re-normalised rather than concatenated: two epics can each be in
    // canonical order and still interleave when joined.
    deliverables: sanitizeDeliverables(
      deliverables.flatMap((d) => (d.status === "ok" ? d.deliverables : []))
    ),
  }
}

export interface ConfirmBookingInput {
  date: string
  /** Null books no room at all — an online-only meeting. */
  room: string | null
  startTime: string
  endTime: string
  /** The editable half of the topic; the prefix is derived here. */
  titleSuffix: string
  attendees: AttendeeContact[]
  /** Keycloak group name, when the attendees came from a group button. */
  groupName?: string | null
  /** Free text: what the meeting is for. Handed to GitLab as AGENDA. */
  agenda?: string | null
  /**
   * Epics this meeting belongs to. Any form the picker or a person produces;
   * resolved against GitLab here. Empty means the pipeline opens a standalone
   * epic for what is, by definition, an ad-hoc meeting.
   *
   * No `deliverables` field on purpose — they come from the epic, never from
   * the form. A meeting with deliverables and no epic isn't ad-hoc.
   */
  issueRefs?: string[]
}

export type BookingResult = {
  /** The Portal booking that was made, when one was. */
  bookingId?: string
  inviteError?: string
  /**
   * Why the booking didn't happen, when it didn't.
   *
   * Returned rather than thrown because Next.js redacts errors thrown from a
   * Server Action in production — every failure reached the user as "An error
   * occurred in the Server Components render", including ones with a perfectly
   * good explanation like the dept system's own rejection message.
   */
  error?: string
}

function failureText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function confirmBookingFor(
  supabase: SupabaseClient<Database>,
  user: BookingUser,
  input: ConfirmBookingInput
): Promise<BookingResult> {
  // The picker only offers valid slots, but this action takes whatever the
  // request carries. Checked before anything is booked, triggered or written.
  const times = validateBookingTimes(input.startTime, input.endTime, DAY_WINDOW)
  if (!times.ok) return { error: times.error }

  // Derived server-side from the group and the attendee list, never taken
  // from the client: the prefix decides which project a Teams recording
  // files itself under, so it must not be something a caller can name.
  const prefix = topicPrefix({
    groupName: input.groupName,
    firstAttendeeUsername: input.attendees.find((a) => a.username)?.username,
  })
  const title = composeTopic(prefix, input.titleSuffix)

  const epicLink = await resolveEpicLink(input.groupName, input.issueRefs ?? [])

  try {
    const outcome = await placeBooking(supabase, requireServiceAccount(), {
      date: input.date,
      room: input.room,
      startTime: input.startTime,
      endTime: input.endTime,
      title,
      attendees: input.attendees,
      organizer: { id: user.id, name: user.name, email: user.email ?? "" },
      // Every meeting Portal books gets a Teams meeting — the point of the
      // whole thing is that there's a recording to look back at afterwards.
      online: true,
      meetingPrefix: prefix,
      groupName: input.groupName ?? null,
      agenda: input.agenda?.trim() || null,
      // Both read back from GitLab rather than trusted from the form: the
      // refs decide which epic a marker comment lands on, and the
      // deliverables become labels on it.
      deliverables: epicLink.deliverables,
      issueRefs: epicLink.issueRefs,
    })

    revalidatePath("/rooms")
    return {
      bookingId: outcome.bookingId,
      ...(outcome.inviteError ? { inviteError: outcome.inviteError } : {}),
    }
  } catch (err) {
    // Logged as well as returned: the log is what the standup reads, the
    // return value is what the person staring at the dialog reads.
    console.error("[rooms] booking failed", err)
    return { error: failureText(err) }
  }
}

/**
 * Asks the pipeline to take down the Teams meeting for a cancelled booking.
 *
 * Never throws: the room is already released and the attendees already have
 * their cancellation by the time this runs, so failing here must not read as
 * "the cancellation didn't work". A meeting that can't be taken down is
 * reported to its creator by the callback instead — it's the one case where
 * something is genuinely left behind, since it will still start and still
 * record.
 */
async function cancelTeamsMeeting(
  bookingId: string,
  date: string,
  startTime: string
): Promise<void> {
  if (!meetingPipelineConfigured()) return
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("rooms_meeting_requests")
      .select("cancel_id, message_id")
      .eq("booking_id", bookingId)
      .eq("kind", "create")
      .eq("status", "success")
      .maybeSingle()

    // No successful creation means there's no meeting to take down — the
    // request failed, or never happened.
    if (!data?.cancel_id || !data.message_id) return

    await triggerMeetingCancel(admin, {
      bookingId,
      cancelId: data.cancel_id,
      messageId: data.message_id,
      start: taipeiIso(date, startTime),
      reason: "此會議已取消(教室預約已取消)",
    })
  } catch (err) {
    console.error("[rooms] teams meeting cancel trigger failed", err)
  }
}

export async function cancelBookingFor(
  supabase: SupabaseClient<Database>,
  user: BookingUser,
  bookingId: string
): Promise<BookingResult> {
  const subscriber = requireServiceAccount()

  const { data: booking, error } = await supabase
    .from("rooms_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("status", "booked")
    .single()

  if (error || !booking) {
    return { error: "找不到這筆預約,或已經被取消" }
  }
  if (booking.requested_by !== user.id) {
    return { error: "只能取消自己建立的預約" }
  }

  // An online-only meeting reserved nothing, so there's nothing to release.
  if (booking.external_reservation_id && booking.room) {
    try {
      await cancelRoomBooking(booking.external_reservation_id, {
        room: booking.room,
        start: taipeiIso(booking.date, booking.start_time),
        end: taipeiIso(booking.date, booking.end_time),
        subscriber,
      })
    } catch (err) {
      console.error("[rooms] cancel failed", err)
      return { error: failureText(err) }
    }
  }

  const { error: updateError } = await supabase
    .from("rooms_bookings")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    })
    .eq("id", bookingId)

  if (updateError) {
    return {
      error: `外部系統已取消成功,但 Portal 稽核紀錄更新失敗:${updateError.message}——請通知管理員手動確認,避免紀錄跟實際狀態不一致`,
    }
  }

  await cancelTeamsMeeting(booking.id, booking.date, booking.start_time)

  revalidatePath("/rooms")

  // Same reasoning as confirmBooking: the cancellation already went through,
  // so a mail failure is reported rather than thrown.
  const sent = await sendBookingInvite({
    bookingId: booking.id,
    title: booking.title ?? `${booking.room} 借用`,
    room: booking.room,
    date: booking.date,
    startTime: booking.start_time,
    endTime: booking.end_time,
    start: taipeiIso(booking.date, booking.start_time),
    end: taipeiIso(booking.date, booking.end_time),
    organizer: { name: user.name, email: user.email ?? "" },
    attendees: (booking.attendees ?? []) as unknown as AttendeeContact[],
    cancelled: true,
    // Must exceed whatever the last REQUEST used. A booking that picked up a
    // meeting link has already sent sequence 1, so a hardcoded 1 here would
    // be ignored and the event would stay in everyone's calendar.
    sequence: await nextInviteSequence(booking.id),
  })

  return sent.ok ? {} : { inviteError: sent.error }
}
