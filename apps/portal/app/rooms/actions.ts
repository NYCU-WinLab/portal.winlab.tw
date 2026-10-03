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
import { validateRecurringSchedule } from "@/lib/rooms/booking-times"
import {
  DAY_WINDOW,
  fetchAvailabilityRange,
  fetchPortalBookingsForDate,
  type BookingMeeting,
  type DayAvailability,
  type PortalBooking,
} from "@/lib/rooms/fetch"
import {
  fetchAttendeeGroups,
  gitlabPathForGroup,
} from "@/lib/rooms/keycloak-groups"
import {
  fetchEpic,
  fetchEpicDeliverables,
  fetchOpenEpics,
  type EpicDeliverablesResult,
  type EpicsResult,
} from "@/lib/gitlab/client"
import {
  nextOccurrenceOnOrAfter,
  nextWeekdayOnOrAfter,
} from "@/lib/rooms/recurrence"
import { catchUpNewSeries } from "@/lib/rooms/recurring-run"
import { composeTopic, topicPrefix } from "@/lib/rooms/meeting-topic"
import { todayInTaipei } from "@/lib/rooms/date"
import {
  cancelBookingFor,
  confirmBookingFor,
  failureText,
  resolveEpicLink,
  type BookingResult,
  type ConfirmBookingInput,
} from "@/lib/rooms/confirm"

/** `days` calendar days starting at `startDate`. */
export async function getRoomAvailabilityRange(
  startDate: string,
  days: number
): Promise<DayAvailability[]> {
  return fetchAvailabilityRange(startDate, days)
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

/**
 * The open epics of the group a booking is being made for.
 *
 * Takes the Keycloak group leaf, not a GitLab path: the path is resolved from
 * that group's `gitlab_path` attribute server-side, so this can only ever read
 * a group the caller was already booking under.
 */
export async function getGroupEpics(
  groupName: string | null
): Promise<EpicsResult> {
  const user = await getCurrentUser()
  if (!user) return { status: "error", detail: "請先登入" }

  return fetchOpenEpics(await gitlabPathForGroup(groupName))
}

/**
 * What this meeting owes, for the form to show before anyone commits to it.
 *
 * Takes the Keycloak group leaf for the same reason `getGroupEpics` does: the
 * GitLab path is resolved server-side, so this can't be pointed at an epic in
 * some group the caller isn't booking under.
 */
export async function getEpicDeliverables(
  groupName: string | null,
  iid: number
): Promise<EpicDeliverablesResult> {
  const user = await getCurrentUser()
  if (!user) return { status: "error", detail: "請先登入" }

  const groupPath = await gitlabPathForGroup(groupName)
  if (!groupPath) {
    return { status: "error", detail: "這個群組沒有設定 gitlab_path" }
  }
  const read = await fetchEpic(groupPath, iid)
  if (!read.ok) {
    return {
      status: "error",
      detail:
        read.reason === "not_found"
          ? `Epic &${iid} 已不存在`
          : `讀不到 Epic &${iid}:${read.detail}`,
    }
  }
  return fetchEpicDeliverables(groupPath, read.epic)
}

/** Bookings Portal itself made (any lab member's), for matching against the grid. */
export async function getPortalBookingsForDate(
  date: string
): Promise<PortalBooking[]> {
  return fetchPortalBookingsForDate(await createClient(), date)
}

export interface OnlineBooking {
  id: string
  date: string
  startTime: string
  endTime: string
  title: string | null
  attendees: AttendeeContact[]
  requestedBy: string
  meeting: BookingMeeting | null
}

/**
 * Online-only meetings from today onwards.
 *
 * These reserve no room, so they can't appear on the availability grid — a
 * block drawn there would claim a room is taken when none is. Without a list
 * of their own they were invisible: no way to see one existed, and no way to
 * cancel it.
 */
export async function getOnlineBookings(): Promise<OnlineBooking[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms_bookings")
    .select(
      "id, date, start_time, end_time, title, attendees, requested_by, status"
    )
    .is("room", null)
    .eq("status", "booked")
    .gte("date", todayInTaipei())
    .order("date")
    .order("start_time")

  if (error) throw new Error(`讀取線上會議失敗:${error.message}`)

  const bookings = data ?? []
  if (bookings.length === 0) return []

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
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title,
    attendees: (row.attendees ?? []) as unknown as AttendeeContact[],
    requestedBy: row.requested_by,
    meeting: byBooking.get(row.id) ?? null,
  }))
}

export type { BookingResult, ConfirmBookingInput }

export async function confirmBooking(
  input: ConfirmBookingInput
): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "請先登入" }
  return confirmBookingFor(await createClient(), user, input)
}

export async function cancelBooking(bookingId: string): Promise<BookingResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "請先登入" }
  return cancelBookingFor(await createClient(), user, bookingId)
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
  /**
   * The next date this series meets, and whether a room is already held for
   * it. Null `nextDate` only for an inactive series — an active one always
   * has a next occurrence.
   */
  nextDate: string | null
  nextBookedRoom: string | null
  /** True when that occurrence exists as a booking, room or online-only. */
  nextBooked: boolean
}

export async function getRecurringMeetings(): Promise<RecurringMeeting[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("rooms_recurring_meetings")
    .select("*")
    .order("weekday")
    .order("start_time")
  if (error) throw new Error(`讀取固定會議失敗:${error.message}`)

  const rows = data ?? []
  const today = todayInTaipei()

  // Next occurrence per series, then one query for the bookings that cover
  // them. Read by recurring_id rather than by date+time: that link is what the
  // cron and the catch-up write, and matching on the slot instead would claim
  // somebody else's booking at the same hour in a different room.
  const nextDates = new Map<string, string | null>(
    rows.map((row) => [
      row.id,
      row.active
        ? nextOccurrenceOnOrAfter(
            {
              weekday: row.weekday,
              intervalWeeks: row.interval_weeks,
              anchorDate: row.anchor_date,
            },
            today
          )
        : null,
    ])
  )

  const wanted = [...nextDates.values()].filter((d) => d !== null)
  const bookings = wanted.length
    ? ((
        await supabase
          .from("rooms_bookings")
          .select("recurring_id, date, room")
          .eq("status", "booked")
          .not("recurring_id", "is", null)
          .in("date", wanted)
      ).data ?? [])
    : []

  // Keyed on the pair, because a fortnightly and a weekly series can both be
  // due on one date and each wants its own answer.
  const booked = new Map(
    bookings.map((b) => [`${b.recurring_id}:${b.date}`, b.room])
  )

  return rows.map((row) => {
    const nextDate = nextDates.get(row.id) ?? null
    const key = nextDate ? `${row.id}:${nextDate}` : null
    const hasBooking = key !== null && booked.has(key)
    return {
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
      nextDate,
      nextBookedRoom: hasBooking ? (booked.get(key!) ?? null) : null,
      nextBooked: hasBooking,
    }
  })
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
  /** Free text: what the meeting is for. Handed to GitLab as AGENDA. */
  agenda?: string | null
  /**
   * Optional Sync container reused by every occurrence. A selected Report or
   * single Meeting is rejected server-side.
   */
  issueRefs?: string[]
}

/** What the catch-up managed to do, so the form can say it out loud. */
export interface CreateRecurringResult {
  /** Occurrences inside the cron's blind window that were booked just now. */
  booked: number
  /** Ones that needed a room and could not get one. */
  failed: number
  errors: string[]
  /**
   * Set when nothing was created. Returned rather than thrown: a thrown
   * error is redacted to something meaningless in production.
   */
  error?: string
}

export async function createRecurringMeeting(
  input: CreateRecurringInput
): Promise<CreateRecurringResult> {
  const user = await getCurrentUser()
  if (!user) return { booked: 0, failed: 0, errors: [], error: "請先登入" }

  // The form only offers valid choices, but `start_time` is plain text in the
  // DB, so a start off the grid or past the day's window would otherwise be
  // stored and fail a week later in the nightly run. Checked before anything
  // is written; the rest mirrors the table's CHECKs with readable errors.
  const schedule = validateRecurringSchedule(input, DAY_WINDOW)
  if (!schedule.ok) {
    return { booked: 0, failed: 0, errors: [], error: schedule.error }
  }

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

  // Frozen at creation for the same reason the prefix is: the epic a standing
  // series reports into shouldn't change under it because someone relabelled
  // something in GitLab midway through a term.
  // Thrown on a bad, unreadable or non-Sync epic. Returned rather than let
  // through: a Server Action's thrown error reaches the form redacted.
  let epicLink: Awaited<ReturnType<typeof resolveEpicLink>>
  try {
    epicLink = await resolveEpicLink(
      input.groupName,
      input.issueRefs ?? [],
      true
    )
  } catch (err) {
    // Logged as well as returned, as confirmBookingFor does.
    console.error("[rooms] recurring epic link failed", err)
    return { booked: 0, failed: 0, errors: [], error: failureText(err) }
  }

  const supabase = await createClient()
  const { data: created, error } = await supabase
    .from("rooms_recurring_meetings")
    .insert({
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
      agenda: input.agenda?.trim() || null,
      deliverables: epicLink.deliverables,
      issue_refs: epicLink.issueRefs,
    })
    .select("id")
    .single()
  if (error || !created) {
    return {
      booked: 0,
      failed: 0,
      errors: [],
      error: `建立固定會議失敗:${error?.message ?? "unknown"}`,
    }
  }

  // The nightly run only ever looks at today + 7, so any occurrence already
  // inside that window would never be booked by anything. Do it here, now,
  // while the person who asked for it is still looking at the screen.
  //
  // Deliberately not fatal: the series exists either way, and a room that
  // could not be got is something to report, not a reason to claim the series
  // was not created.
  let catchUp: CreateRecurringResult
  try {
    const run = await catchUpNewSeries(created.id)
    catchUp = { booked: run.booked, failed: run.failed, errors: run.errors }
  } catch (err) {
    console.error("[rooms] recurring catch-up failed", err)
    catchUp = {
      booked: 0,
      failed: 0,
      errors: [err instanceof Error ? err.message : String(err)],
    }
  }

  revalidatePath("/rooms")
  return catchUp
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
