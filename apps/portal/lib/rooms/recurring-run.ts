// Places the next occurrence of each standing meeting, one week out.
//
// One week rather than the whole term: rooms here are first-come-first-served,
// so holding a free room for months would be antisocial, and booking a week
// at a time lets each occurrence re-run the room preference against whatever
// is actually free by then.

import { render } from "@react-email/render"

import { RecurringFailed } from "@/emails/rooms/recurring-failed"
import { createAdminClient } from "@/lib/supabase/admin"
import { getResend, MAIL_FROM_ROOMS } from "@/lib/email/resend"

import type { AttendeeContact } from "./attendee-groups"
import { mergeAttendees, ADVISOR_USERNAME } from "./attendee-groups"
import { computeDayAvailability, suggestRoom } from "./availability"
import { placeBooking } from "./book"
import { fetchBusySlotsForDates, fetchRooms } from "./client"
import { addDays, formatDayLabel, todayInTaipei } from "./date"
import { endTimeOf, occursOn } from "./recurrence"

/** How far ahead to book. Early enough to get a room, late enough not to hoard one. */
export const LEAD_DAYS = 7

const DAY_WINDOW = { startHour: 8, endHour: 22, slotMinutes: 30 }
const SLOT_MINUTES = 30

export interface RecurringRunResult {
  date: string
  due: number
  booked: number
  skipped: number
  failed: number
  errors: string[]
}

type ScheduleRow = {
  id: string
  title: string
  weekday: number
  start_time: string
  duration_minutes: number
  interval_weeks: number
  anchor_date: string
  attendees: unknown
  include_advisor: boolean
  created_by: string
  meeting_prefix: string | null
  online: boolean
  group_name: string | null
  agenda: string | null
}

export async function runRecurringBookings(
  today = todayInTaipei()
): Promise<RecurringRunResult> {
  const date = addDays(today, LEAD_DAYS)
  const admin = createAdminClient()
  const result: RecurringRunResult = {
    date,
    due: 0,
    booked: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const { data: schedules, error } = await admin
    .from("rooms_recurring_meetings")
    .select(
      "id, title, weekday, start_time, duration_minutes, interval_weeks, anchor_date, attendees, include_advisor, created_by, meeting_prefix, online, group_name, agenda"
    )
    .eq("active", true)
  if (error) throw new Error(`讀取固定會議失敗:${error.message}`)

  const due = ((schedules ?? []) as ScheduleRow[]).filter((s) =>
    occursOn(
      {
        weekday: s.weekday,
        intervalWeeks: s.interval_weeks,
        anchorDate: s.anchor_date,
      },
      date
    )
  )
  result.due = due.length
  if (due.length === 0) return result

  // Availability for that one day, shared across every schedule due on it.
  const rooms = await fetchRooms()
  const busyByDate = await fetchBusySlotsForDates(
    rooms.filter((r) => r.active).map((r) => r.name),
    [date]
  )
  const slots = computeDayAvailability(
    rooms,
    busyByDate.get(date) ?? [],
    date,
    DAY_WINDOW
  )

  const subscriber = process.env.MEETINGROOM_SERVICE_USER
  if (!subscriber) throw new Error("MEETINGROOM_SERVICE_USER 未設定")

  for (const schedule of due) {
    // Don't double-book if a previous run already placed this occurrence.
    const { data: existing } = await admin
      .from("rooms_bookings")
      .select("id")
      .eq("recurring_id", schedule.id)
      .eq("date", date)
      .eq("status", "booked")
      .maybeSingle()
    if (existing) {
      result.skipped++
      continue
    }

    const endTime = endTimeOf(schedule.start_time, schedule.duration_minutes)
    const startIndex = slots.findIndex((s) => s.start === schedule.start_time)
    const suggestion =
      startIndex === -1
        ? null
        : suggestRoom(
            slots,
            startIndex,
            schedule.duration_minutes / SLOT_MINUTES
          )

    if (!suggestion) {
      result.failed++
      const reason =
        startIndex === -1
          ? `${schedule.start_time} 不在可預約時段內(08:00–22:00)`
          : "這個時段沒有教室從頭到尾都空著"
      result.errors.push(`${schedule.title}: ${reason}`)
      await notifyOwner(admin, schedule, date, endTime, reason)
      continue
    }

    try {
      const organizer = await ownerContact(admin, schedule.created_by)
      const attendees = await withAdvisor(
        admin,
        (schedule.attendees ?? []) as AttendeeContact[],
        schedule.include_advisor
      )

      await placeBooking(admin, subscriber, {
        date,
        room: suggestion.room,
        startTime: schedule.start_time,
        endTime,
        // Already composed as `[prefix]-suffix` when the series was created.
        // Teams appends its own timestamp to the recording filename, so every
        // occurrence sharing one topic doesn't collide.
        title: schedule.title,
        attendees,
        organizer,
        recurringId: schedule.id,
        online: schedule.online,
        meetingPrefix: schedule.meeting_prefix,
        groupName: schedule.group_name,
        agenda: schedule.agenda,
      })
      result.booked++
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      result.failed++
      result.errors.push(`${schedule.title}: ${reason}`)
      await notifyOwner(admin, schedule, date, endTime, reason)
    }
  }

  return result
}

async function ownerContact(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ id: string; name: string; email: string }> {
  const { data } = await admin
    .from("user_profiles")
    .select("id, name, email")
    .eq("id", userId)
    .maybeSingle()
  return {
    id: userId,
    name: data?.name ?? data?.email ?? "WinLab",
    email: data?.email ?? "",
  }
}

/** The advisor isn't in any project group, so he's merged in per schedule. */
async function withAdvisor(
  admin: ReturnType<typeof createAdminClient>,
  attendees: AttendeeContact[],
  include: boolean
): Promise<AttendeeContact[]> {
  if (!include) return attendees
  const { data } = await admin
    .from("user_profiles")
    .select("name, email")
    .eq("username", ADVISOR_USERNAME)
    .maybeSingle()
  if (!data?.email) return attendees
  return mergeAttendees(attendees, [
    { name: data.name ?? data.email, email: data.email },
  ])
}

/**
 * Tell whoever set the series up. A missed booking that nobody hears about
 * looks identical to a meeting that simply had no room — and by the time
 * anyone notices, the slot is gone.
 */
async function notifyOwner(
  admin: ReturnType<typeof createAdminClient>,
  schedule: ScheduleRow,
  date: string,
  endTime: string,
  reason: string
): Promise<void> {
  try {
    const owner = await ownerContact(admin, schedule.created_by)
    if (!owner.email) return

    const html = await render(
      RecurringFailed({
        title: schedule.title,
        when: `${formatDayLabel(date)} ${schedule.start_time}–${endTime}`,
        reason,
      })
    )
    await getResend().emails.send({
      from: MAIL_FROM_ROOMS,
      to: owner.email,
      subject: `固定會議沒訂到教室:${schedule.title}`,
      html,
    })
  } catch (err) {
    // Already in the failure path; the run result still carries the error.
    console.error("[rooms] recurring failure notice failed", err)
  }
}
