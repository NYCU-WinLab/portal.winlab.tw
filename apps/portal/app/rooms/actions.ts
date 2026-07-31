"use server"

// Proxies the CS department's meeting-room system server-side: the browser
// can't call it directly (that origin doesn't send CORS headers for
// portal.winlab.tw), and doing the fetch here keeps the reverse-engineered
// API details (see lib/rooms/client.ts) off the client bundle.

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/lib/supabase/database.types"
import { getCurrentUser } from "@/lib/user"
import {
  toPickableGroups,
  type AttendeeContact,
  type PickableGroup,
} from "@/lib/rooms/attendee-groups"
import {
  computeDayAvailability,
  type AvailabilitySlot,
} from "@/lib/rooms/availability"
import { fetchAttendeeGroups } from "@/lib/rooms/keycloak-groups"
import { nextWeekdayOnOrAfter } from "@/lib/rooms/recurrence"
import { nextInviteSequence, placeBooking } from "@/lib/rooms/book"
import { composeTopic, topicPrefix } from "@/lib/rooms/meeting-topic"
import {
  meetingPipelineConfigured,
  triggerMeetingCancel,
} from "@/lib/rooms/meeting-pipeline"
import { createAdminClient } from "@/lib/supabase/admin"
import { cancelRoomBooking } from "@/lib/rooms/booking-client"
import { fetchBusySlotsForDates, fetchRooms } from "@/lib/rooms/client"
import { addDays, taipeiIso, todayInTaipei } from "@/lib/rooms/date"
import { sendBookingInvite } from "@/lib/rooms/invite-mail"

const DAY_WINDOW = { startHour: 8, endHour: 22, slotMinutes: 30 }

export interface DayAvailability {
  date: string
  slots: AvailabilitySlot[]
}

/** `days` calendar days starting at `startDate`. */
export async function getRoomAvailabilityRange(
  startDate: string,
  days: number
): Promise<DayAvailability[]> {
  const rooms = await fetchRooms()
  const activeRoomNames = rooms.filter((r) => r.active).map((r) => r.name)
  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i))

  const busyByDate = await fetchBusySlotsForDates(activeRoomNames, dates)
  return dates.map((date) => ({
    date,
    slots: computeDayAvailability(
      rooms,
      busyByDate.get(date) ?? [],
      date,
      DAY_WINDOW
    ),
  }))
}

function requireServiceAccount(): string {
  const user = process.env.MEETINGROOM_SERVICE_USER
  if (!user) {
    throw new Error("自動預約尚未設定服務帳號(MEETINGROOM_SERVICE_USER)")
  }
  return user
}

export type AttendeeGroupsResponse =
  | {
      status: "ok"
      groups: PickableGroup[]
      /** Diagnostics, so an empty result can say which step came up empty. */
      rootGroupCount: number
      subGroupCount: number
      unmailableSample: string[]
    }
  | { status: "unconfigured" }
  | { status: "forbidden"; detail: string }
  | { status: "error"; detail: string }

/**
 * Keycloak subgroups mapped onto portal users, for the picker's "add
 * everyone in this group" shortcut.
 *
 * Reports why the list is empty instead of just returning nothing: an empty
 * array could mean "no groups", "no permission", or "not configured", and
 * collapsing those into one silent case made a real misconfiguration take a
 * round trip to diagnose.
 */
export async function getAttendeeGroups(): Promise<AttendeeGroupsResponse> {
  const result = await fetchAttendeeGroups()
  if (result.status !== "ok") return result

  const groups = toPickableGroups(result.groups)
  return {
    status: "ok",
    groups,
    rootGroupCount: result.rootGroupCount,
    subGroupCount: result.groups.length,
    unmailableSample: [...new Set(groups.flatMap((g) => g.unmailable))].slice(
      0,
      5
    ),
  }
}

export interface BookingMeeting {
  status: "pending" | "success" | "failed"
  joinUrl: string | null
  errorCode: string | null
}

export interface PortalBooking {
  id: string
  room: string
  date: string
  startTime: string
  endTime: string
  requestedBy: string
  title: string | null
  attendees: AttendeeContact[]
  /** Null when no Teams meeting was ever requested for this booking. */
  meeting: BookingMeeting | null
}

/** Bookings Portal itself made (any lab member's), for matching against the grid. */
export async function getPortalBookingsForDate(
  date: string
): Promise<PortalBooking[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms_bookings")
    .select(
      "id, room, date, start_time, end_time, requested_by, title, attendees"
    )
    .eq("date", date)
    .eq("status", "booked")
    // Online-only meetings reserve no room, so they have nothing to match
    // against the availability grid this feeds.
    .not("room", "is", null)

  if (error) {
    throw new Error(`讀取 Portal 預約紀錄失敗:${error.message}`)
  }

  const bookings = data ?? []

  // Second query rather than a join: the meeting request is optional and its
  // absence is meaningful ("no Teams meeting was asked for"), which an inner
  // join would turn into a missing booking.
  const { data: requests } = await supabase
    .from("rooms_meeting_requests")
    .select("booking_id, status, join_url, error_code")
    .eq("kind", "create")
    .in(
      "booking_id",
      bookings.map((b) => b.id)
    )

  const byBooking = new Map<string, BookingMeeting>()
  for (const r of requests ?? []) {
    if (!r.booking_id) continue
    byBooking.set(r.booking_id, {
      status: r.status as BookingMeeting["status"],
      joinUrl: r.join_url,
      errorCode: r.error_code,
    })
  }

  return bookings.map((row) => ({
    id: row.id,
    room: row.room!,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    requestedBy: row.requested_by,
    title: row.title,
    attendees: (row.attendees ?? []) as unknown as AttendeeContact[],
    meeting: byBooking.get(row.id) ?? null,
  }))
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
}

export type BookingResult = { inviteError?: string }

export async function confirmBooking(
  input: ConfirmBookingInput
): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error("請先登入")

  // Derived server-side from the group and the attendee list, never taken
  // from the client: the prefix decides which project a Teams recording
  // files itself under, so it must not be something a caller can name.
  const prefix = topicPrefix({
    groupName: input.groupName,
    firstAttendeeUsername: input.attendees.find((a) => a.username)?.username,
  })
  const title = composeTopic(prefix, input.titleSuffix)

  const supabase = await createClient()
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
  })

  revalidatePath("/rooms")
  return outcome.inviteError ? { inviteError: outcome.inviteError } : {}
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

export async function cancelBooking(bookingId: string): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error("請先登入")

  const subscriber = requireServiceAccount()
  const supabase = await createClient()

  const { data: booking, error } = await supabase
    .from("rooms_bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("status", "booked")
    .single()

  if (error || !booking) {
    throw new Error("找不到這筆預約,或已經被取消")
  }
  if (booking.requested_by !== user.id) {
    throw new Error("只能取消自己建立的預約")
  }

  // An online-only meeting reserved nothing, so there's nothing to release.
  if (booking.external_reservation_id && booking.room) {
    await cancelRoomBooking(booking.external_reservation_id, {
      room: booking.room,
      start: taipeiIso(booking.date, booking.start_time),
      end: taipeiIso(booking.date, booking.end_time),
      subscriber,
    })
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
    throw new Error(
      `外部系統已取消成功,但 Portal 稽核紀錄更新失敗:${updateError.message}——請通知管理員手動確認,避免紀錄跟實際狀態不一致`
    )
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

export interface RecurringMeeting {
  id: string
  title: string
  weekday: number
  startTime: string
  durationMinutes: number
  intervalWeeks: number
  anchorDate: string
  attendees: AttendeeContact[]
  includeAdvisor: boolean
  active: boolean
  createdBy: string
}

export async function getRecurringMeetings(): Promise<RecurringMeeting[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms_recurring_meetings")
    .select("*")
    .order("weekday")
    .order("start_time")
  if (error) throw new Error(`讀取固定會議失敗:${error.message}`)

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    weekday: row.weekday,
    startTime: row.start_time,
    durationMinutes: row.duration_minutes,
    intervalWeeks: row.interval_weeks,
    anchorDate: row.anchor_date,
    attendees: (row.attendees ?? []) as unknown as AttendeeContact[],
    includeAdvisor: row.include_advisor,
    active: row.active,
    createdBy: row.created_by,
  }))
}

export interface CreateRecurringInput {
  /** The editable half of the topic; the prefix is derived here. */
  titleSuffix: string
  weekday: number
  startTime: string
  durationMinutes: number
  intervalWeeks: number
  attendees: AttendeeContact[]
  includeAdvisor: boolean
  /** Keycloak group name, when the attendees came from a group button. */
  groupName?: string | null
}

export async function createRecurringMeeting(
  input: CreateRecurringInput
): Promise<void> {
  const user = await getCurrentUser()
  if (!user) throw new Error("請先登入")

  // Frozen at creation, not recomputed per occurrence: if the prefix were
  // rebuilt each week from whoever is in the group by then, someone joining
  // or leaving would silently start filing the series' recordings under a
  // different name halfway through a term.
  const prefix = topicPrefix({
    groupName: input.groupName,
    firstAttendeeUsername: input.attendees.find((a) => a.username)?.username,
  })
  const title = composeTopic(prefix, input.titleSuffix)

  // The anchor fixes which week a fortnightly series lands on. Using the
  // next matching weekday (rather than today) means "every other Monday"
  // starts from the Monday the user is thinking of, not from whenever the
  // form happened to be submitted.
  const anchorDate = nextWeekdayOnOrAfter(todayInTaipei(), input.weekday)

  const supabase = await createClient()
  const { error } = await supabase.from("rooms_recurring_meetings").insert({
    title,
    weekday: input.weekday,
    start_time: input.startTime,
    duration_minutes: input.durationMinutes,
    interval_weeks: input.intervalWeeks,
    anchor_date: anchorDate,
    attendees: input.attendees as unknown as Json,
    include_advisor: input.includeAdvisor,
    created_by: user.id,
    meeting_prefix: prefix,
    group_name: input.groupName ?? null,
  })
  if (error) throw new Error(`建立固定會議失敗:${error.message}`)

  revalidatePath("/rooms")
}

export async function setRecurringActive(
  id: string,
  active: boolean
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rooms_recurring_meetings")
    .update({ active })
    .eq("id", id)
  if (error) throw new Error(`更新失敗:${error.message}`)
  revalidatePath("/rooms")
}

export async function deleteRecurringMeeting(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rooms_recurring_meetings")
    .delete()
    .eq("id", id)
  if (error) throw new Error(`刪除失敗:${error.message}`)
  revalidatePath("/rooms")
}
