import type { SupabaseClient } from "@supabase/supabase-js"

import type { AttendeeContact } from "@/lib/rooms/attendee-groups"
import {
  computeDayAvailability,
  type AvailabilityOptions,
  type AvailabilitySlot,
} from "@/lib/rooms/availability"
import { fetchBusySlotsForDates, fetchRooms } from "@/lib/rooms/client"
import { addDays } from "@/lib/rooms/date"

/** The slice of the day /rooms draws, and the grid it draws it on. */
export const DAY_WINDOW: AvailabilityOptions = {
  startHour: 8,
  endHour: 22,
  slotMinutes: 30,
}

export interface DayAvailability {
  date: string
  slots: AvailabilitySlot[]
}

/**
 * `days` calendar days of department-wide availability starting at
 * `startDate`. Reads the CS department's system anonymously, so it touches no
 * Supabase client and needs no caller — the web action and the MCP tool share
 * it unchanged.
 */
export async function fetchAvailabilityRange(
  startDate: string,
  days: number,
  window: AvailabilityOptions = DAY_WINDOW
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
      window
    ),
  }))
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

interface BookingRow {
  id: string
  room: string | null
  date: string
  start_time: string
  end_time: string
  requested_by: string
  title: string | null
  attendees: AttendeeContact[] | null
}

interface MeetingRequestRow {
  booking_id: string | null
  status: string
  join_url: string | null
  error_code: string | null
}

async function meetingsByBooking(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<Map<string, BookingMeeting>> {
  const byBooking = new Map<string, BookingMeeting>()
  if (bookingIds.length === 0) return byBooking

  // Second query rather than a join: the meeting request is optional and its
  // absence is meaningful ("no Teams meeting was asked for"), which an inner
  // join would turn into a missing booking.
  const { data } = await supabase
    .from("rooms_meeting_requests")
    .select("booking_id, status, join_url, error_code")
    .eq("kind", "create")
    .in("booking_id", bookingIds)

  for (const r of (data ?? []) as MeetingRequestRow[]) {
    if (!r.booking_id) continue
    byBooking.set(r.booking_id, {
      status: r.status as BookingMeeting["status"],
      joinUrl: r.join_url,
      errorCode: r.error_code,
    })
  }
  return byBooking
}

/** Bookings Portal itself made (any lab member's), for matching against the grid. */
export async function fetchPortalBookingsForDate(
  supabase: SupabaseClient,
  date: string
): Promise<PortalBooking[]> {
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

  const bookings = (data ?? []) as BookingRow[]
  const byBooking = await meetingsByBooking(
    supabase,
    bookings.map((b) => b.id)
  )

  return bookings.map((row) => ({
    id: row.id,
    room: row.room!,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    requestedBy: row.requested_by,
    title: row.title,
    attendees: row.attendees ?? [],
    meeting: byBooking.get(row.id) ?? null,
  }))
}

export interface PortalBookingInRange {
  id: string
  date: string
  startTime: string
  endTime: string
  /** Null for an online-only meeting, which reserves no room. */
  room: string | null
  online: boolean
  status: string
  title: string | null
  agenda: string | null
  requestedBy: string
  requestedByName: string | null
  attendees: AttendeeContact[]
  cancelledAt: string | null
  meeting: BookingMeeting | null
}

interface RangeBookingRow extends BookingRow {
  online: boolean
  status: string
  agenda: string | null
  cancelled_at: string | null
}

/**
 * Every Portal booking in a date window, cancelled ones included.
 *
 * Cancelled rows stay for the same reason the GitLab feed keeps them (see
 * bookings-feed.ts): absence cannot tell "cancelled" apart from "never
 * existed", and a reader forced to guess eventually guesses wrong.
 */
export async function fetchPortalBookingsInRange(
  supabase: SupabaseClient,
  from: string,
  to: string
): Promise<PortalBookingInRange[]> {
  const { data, error } = await supabase
    .from("rooms_bookings")
    .select(
      "id, room, date, start_time, end_time, requested_by, title, attendees, online, status, agenda, cancelled_at"
    )
    .gte("date", from)
    .lte("date", to)
    .order("date")
    .order("start_time")

  if (error) {
    throw new Error(`讀取 Portal 預約紀錄失敗:${error.message}`)
  }

  const bookings = (data ?? []) as RangeBookingRow[]
  const [byBooking, names] = await Promise.all([
    meetingsByBooking(
      supabase,
      bookings.map((b) => b.id)
    ),
    requesterNames(
      supabase,
      bookings.map((b) => b.requested_by)
    ),
  ])

  return bookings.map((row) => ({
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    room: row.room,
    online: row.online,
    status: row.status,
    title: row.title,
    agenda: row.agenda,
    requestedBy: row.requested_by,
    requestedByName: names.get(row.requested_by) ?? null,
    attendees: row.attendees ?? [],
    cancelledAt: row.cancelled_at,
    meeting: byBooking.get(row.id) ?? null,
  }))
}

async function requesterNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>()
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return names

  const { data } = await supabase
    .from("user_profiles")
    .select("id, name")
    .in("id", unique)
  for (const p of (data ?? []) as { id: string; name: string | null }[]) {
    names.set(p.id, p.name)
  }
  return names
}
