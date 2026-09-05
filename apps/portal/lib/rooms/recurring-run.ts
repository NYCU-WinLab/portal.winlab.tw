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
import {
  computeDayAvailability,
  suggestRoom,
  type AvailabilitySlot,
} from "./availability"
import { placeBooking } from "./book"
import { fetchBusySlotsForDates, fetchRooms } from "./client"
import { addDays, formatDayLabel, todayInTaipei } from "./date"
import { endTimeOf, occursOn, occurrencesBetween } from "./recurrence"

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
  deliverables: string[] | null
  issue_refs: string[] | null
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
      "id, title, weekday, start_time, duration_minutes, interval_weeks, anchor_date, attendees, include_advisor, created_by, meeting_prefix, online, group_name, agenda, deliverables, issue_refs"
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
  const slots = await dayAvailability(date)

  const subscriber = process.env.MEETINGROOM_SERVICE_USER
  if (!subscriber) throw new Error("MEETINGROOM_SERVICE_USER 未設定")

  for (const schedule of due) {
    await placeOccurrence(admin, subscriber, schedule, date, slots, result)
  }

  return result
}

/**
 * One occurrence of one series, on one date. Shared by the nightly run and by
 * the catch-up a newly created series triggers, so the two cannot drift on the
 * double-book guard, the room preference, or who gets told when it fails.
 *
 * Records its outcome in `result` rather than returning it, because both
 * callers are accumulating across several placements.
 */
async function placeOccurrence(
  admin: ReturnType<typeof createAdminClient>,
  subscriber: string,
  schedule: ScheduleRow,
  date: string,
  slots: AvailabilitySlot[],
  result: RecurringRunResult
): Promise<void> {
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
    return
  }

  const endTime = endTimeOf(schedule.start_time, schedule.duration_minutes)
  const startIndex = slots.findIndex((s) => s.start === schedule.start_time)
  const suggestion =
    startIndex === -1
      ? null
      : suggestRoom(slots, startIndex, schedule.duration_minutes / SLOT_MINUTES)

  if (!suggestion) {
    result.failed++
    const reason =
      startIndex === -1
        ? `${schedule.start_time} 不在可預約時段內(08:00–22:00)`
        : "這個時段沒有教室從頭到尾都空著"
    result.errors.push(`${schedule.title}: ${reason}`)
    await notifyOwner(admin, schedule, date, endTime, reason)
    return
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
      deliverables: schedule.deliverables ?? [],
      // Carried to every occurrence: a standing series belongs to the same
      // epic each week, and a week that arrived without it would file itself
      // as a parentless one-off.
      issueRefs: schedule.issue_refs ?? [],
    })
    result.booked++
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    result.failed++
    result.errors.push(`${schedule.title}: ${reason}`)
    await notifyOwner(admin, schedule, date, endTime, reason)
  }
}

/** One day's free/busy picture, as the room suggester wants it. */
async function dayAvailability(date: string) {
  const rooms = await fetchRooms()
  const busyByDate = await fetchBusySlotsForDates(
    rooms.filter((r) => r.active).map((r) => r.name),
    [date]
  )
  return computeDayAvailability(
    rooms,
    busyByDate.get(date) ?? [],
    date,
    DAY_WINDOW
  )
}

/**
 * Book the occurrences of a just-created series that the cron will never
 * reach.
 *
 * The nightly run only ever looks at ONE day — today + LEAD_DAYS — so every
 * occurrence already inside that window when the series was created falls
 * through the gap forever. Nobody is told, and the first anyone notices is a
 * meeting with no room (reported 2026-09-04: a Friday series created the
 * evening before, whose Friday was the next day).
 *
 * The window is TOMORROW through today + LEAD_DAYS, both inclusive.
 *
 *   * Tomorrow, not today: a series created at 17:50 for a 15:00 meeting is
 *     asking to book a slot that has already passed, and deciding on the
 *     user's behalf whether "later today" is still worth a room is not this
 *     function's call to make.
 *   * Through today + LEAD_DAYS inclusive, not exclusive: if today's cron run
 *     already happened before the series existed, that day was evaluated
 *     against a schedule list this series was not in. Including it costs
 *     nothing — placeOccurrence's own guard makes a repeat a no-op — and
 *     leaving it out would miss exactly the case where someone adds a series
 *     in the afternoon.
 *
 * Never throws: the series is already saved, and a room that could not be got
 * must not read as "the series was not created". Failures come back in the
 * result for the caller to surface.
 */
export async function catchUpNewSeries(
  scheduleId: string,
  today = todayInTaipei()
): Promise<RecurringRunResult> {
  const admin = createAdminClient()
  const from = addDays(today, 1)
  const to = addDays(today, LEAD_DAYS)
  const result: RecurringRunResult = {
    date: from,
    due: 0,
    booked: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  }

  const { data: schedule } = await admin
    .from("rooms_recurring_meetings")
    .select(
      "id, title, weekday, start_time, duration_minutes, interval_weeks, anchor_date, attendees, include_advisor, created_by, meeting_prefix, online, group_name, agenda, deliverables, issue_refs"
    )
    .eq("id", scheduleId)
    .maybeSingle()
  if (!schedule) return result

  const row = schedule as ScheduleRow
  const dates = occurrencesBetween(
    {
      weekday: row.weekday,
      intervalWeeks: row.interval_weeks,
      anchorDate: row.anchor_date,
    },
    from,
    to
  )
  result.due = dates.length
  if (dates.length === 0) return result

  const subscriber = process.env.MEETINGROOM_SERVICE_USER
  if (!subscriber) {
    result.failed = dates.length
    result.errors.push("MEETINGROOM_SERVICE_USER 未設定")
    return result
  }

  for (const date of dates) {
    try {
      const slots = await dayAvailability(date)
      await placeOccurrence(admin, subscriber, row, date, slots, result)
    } catch (err) {
      result.failed++
      result.errors.push(
        `${formatDayLabel(date)}: ${err instanceof Error ? err.message : String(err)}`
      )
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
