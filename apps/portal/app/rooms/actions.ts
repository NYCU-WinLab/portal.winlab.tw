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
import { bookRoom, cancelRoomBooking } from "@/lib/rooms/booking-client"
import { fetchBusySlotsForDates, fetchRooms } from "@/lib/rooms/client"
import { addDays, taipeiIso } from "@/lib/rooms/date"
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

export interface PortalBooking {
  id: string
  room: string
  date: string
  startTime: string
  endTime: string
  requestedBy: string
  title: string | null
  attendees: AttendeeContact[]
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

  if (error) {
    throw new Error(`讀取 Portal 預約紀錄失敗:${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    room: row.room,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    requestedBy: row.requested_by,
    title: row.title,
    attendees: (row.attendees ?? []) as unknown as AttendeeContact[],
  }))
}

export interface ConfirmBookingInput {
  date: string
  room: string
  startTime: string
  endTime: string
  title: string
  attendees: AttendeeContact[]
}

export type BookingResult = { inviteError?: string }

export async function confirmBooking(
  input: ConfirmBookingInput
): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) throw new Error("請先登入")

  const title = input.title.trim()
  if (!title) throw new Error("請填寫會議標題")

  const subscriber = requireServiceAccount()
  const start = taipeiIso(input.date, input.startTime)
  const end = taipeiIso(input.date, input.endTime)

  const externalId = await bookRoom({
    room: input.room,
    start,
    end,
    subscriber,
  })

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from("rooms_bookings")
    .insert({
      external_reservation_id: externalId,
      room: input.room,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      requested_by: user.id,
      title,
      attendees: input.attendees as unknown as Json,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    throw new Error(
      `已在外部系統訂到教室(訂位編號 ${externalId}),但寫入 Portal 稽核紀錄失敗:${error?.message ?? "unknown"}——請通知管理員手動補登,避免之後被誤判成可取消`
    )
  }

  revalidatePath("/rooms")

  // The room is booked either way — a mail failure is reported back, not
  // thrown, so it can't read as "the booking didn't happen".
  const sent = await sendBookingInvite({
    bookingId: inserted.id,
    title,
    room: input.room,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    start,
    end,
    organizer: { name: user.name, email: user.email ?? "" },
    attendees: input.attendees,
  })

  return sent.ok ? {} : { inviteError: sent.error }
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

  await cancelRoomBooking(booking.external_reservation_id, {
    room: booking.room,
    start: taipeiIso(booking.date, booking.start_time),
    end: taipeiIso(booking.date, booking.end_time),
    subscriber,
  })

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
  })

  return sent.ok ? {} : { inviteError: sent.error }
}
