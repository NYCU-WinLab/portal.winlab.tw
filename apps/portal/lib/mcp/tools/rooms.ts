import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type Caller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import {
  ADVISOR_USERNAME,
  mergeAttendees,
  toPickableGroups,
  type AttendeeContact,
} from "@/lib/rooms/attendee-groups"
import type { BookingResult, ConfirmBookingInput } from "@/lib/rooms/confirm"
import { fetchAttendeeGroups } from "@/lib/rooms/keycloak-groups"
import {
  composeTopic,
  DEFAULT_TOPIC_SUFFIX,
  topicPrefix,
} from "@/lib/rooms/meeting-topic"
import {
  slotTier,
  suggestRoom,
  type AvailabilitySlot,
  type SlotTier,
} from "@/lib/rooms/availability"
import { addDays, todayInTaipei } from "@/lib/rooms/date"
import {
  DAY_WINDOW,
  fetchAvailabilityRange,
  fetchLabMembers,
  fetchPortalBookingsInRange,
  type LabMember,
} from "@/lib/rooms/fetch"

export type RoomsHooks = {
  // Booking and cancelling go through the lab's shared dept account, the
  // service-role Teams pipeline and the invite mail, so route.ts runs the
  // /rooms actions' own confirmBookingFor / cancelBookingFor and no tool
  // module touches those credentials.
  bookRoom?: (
    caller: Caller,
    input: ConfirmBookingInput
  ) => Promise<BookingResult>
  cancelRoomBooking?: (
    caller: Caller,
    bookingId: string
  ) => Promise<BookingResult>
}

// Who an agent means by each entry: a portal user id, an email or a Keycloak
// username, as the picker's search matches. Only members with an email can
// be invited, as in the picker.
export function resolveAttendees(
  members: LabMember[],
  wanted: string[]
): AttendeeContact[] {
  const contacts: AttendeeContact[] = []
  const unknown: string[] = []
  const unmailable: string[] = []
  for (const raw of wanted) {
    const key = raw.trim().toLowerCase()
    const member = members.find(
      (m) =>
        m.id.toLowerCase() === key ||
        m.email?.toLowerCase() === key ||
        m.username?.toLowerCase() === key
    )
    if (!member) unknown.push(raw)
    else if (!member.email) unmailable.push(member.name ?? raw)
    else {
      contacts.push({
        name: member.name ?? member.username ?? member.email,
        email: member.email,
        // The advisor never names the recording's project, even when listed
        // by hand, as the /rooms page adds him by email only.
        ...(member.username && member.username !== ADVISOR_USERNAME
          ? { username: member.username }
          : {}),
      })
    }
  }
  if (unknown.length > 0) {
    throw new Error(
      `no member matches ${unknown.join(", ")}; give a portal user id, an email or a Keycloak username`
    )
  }
  if (unmailable.length > 0) {
    throw new Error(
      `${unmailable.join(", ")} has no email address, so cannot be invited`
    )
  }
  return mergeAttendees([], contacts)
}

// The advisor the way the /rooms page adds him: on the list by email, never
// by username, so he never names the recording's project.
export function advisorContact(members: LabMember[]): AttendeeContact | null {
  const advisor = members.find(
    (m) => m.username === ADVISOR_USERNAME && m.email
  )
  if (!advisor?.email) return null
  return { name: advisor.name ?? advisor.email, email: advisor.email }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

export interface AvailabilityRun {
  start: string
  end: string
  tier: SlotTier
  free_rooms: string[]
  paid_rooms: string[]
  lab_rooms: string[]
}

function sameRooms(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((room, i) => room === b[i])
}

/**
 * The 30-minute grid collapsed into runs of identical availability.
 *
 * A day is 28 cells wide and most of them repeat, which reads as a wall of
 * near-identical objects to anything consuming this. Runs merge only when the
 * room lists match exactly, so nothing is rounded away — "08:00-12:00, 600A
 * and 345 free" is the same fact as eight cells saying it.
 */
export function mergeRuns(slots: AvailabilitySlot[]): AvailabilityRun[] {
  const runs: AvailabilityRun[] = []
  for (const slot of slots) {
    const last = runs[runs.length - 1]
    if (
      last &&
      last.end === slot.start &&
      sameRooms(last.free_rooms, slot.freeRooms) &&
      sameRooms(last.paid_rooms, slot.paidRooms) &&
      sameRooms(last.lab_rooms, slot.labRooms)
    ) {
      last.end = slot.end
      continue
    }
    runs.push({
      start: slot.start,
      end: slot.end,
      tier: slotTier(slot),
      free_rooms: slot.freeRooms,
      paid_rooms: slot.paidRooms,
      lab_rooms: slot.labRooms,
    })
  }
  return runs
}

function hhmm(time: string): string {
  return time.slice(0, 5)
}

function hour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`
}

// The room /rooms would book for this span: it never lets a member pick one,
// it asks suggestRoom, which takes a room open for every slot, free before
// paid. The span has to sit on the day's grid, as the page's slots do.
export function roomForSpan(
  slots: AvailabilitySlot[],
  startTime: string,
  endTime: string
): { room: string; tier: "free" | "paid" } | null {
  const startIndex = slots.findIndex((slot) => slot.start === startTime)
  const endIndex = slots.findIndex((slot) => slot.end === endTime)
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error(
      `${startTime}-${endTime} is not a span on the 30-minute grid between 08:00 and 22:00`
    )
  }
  return suggestRoom(slots, startIndex, endIndex - startIndex + 1)
}

export function registerRoomsTools(server: McpServer, hooks: RoomsHooks = {}) {
  server.registerTool(
    "list_room_availability",
    {
      title: "List room availability",
      description: `Free and busy time in the CS department's meeting rooms (/rooms) for up to 7 days from date, as runs of the 30-minute grid the page draws: which free-tier rooms are open, which chargeable ones are, and which rooms the lab's shared account already holds. The department system is read anonymously, so every member gets the same answer and none of it is admin-only; lab_bookings adds who booked and what for, but only for the holds Portal itself made. Book a free slot with book_room.`,
      inputSchema: z.object({
        date: z
          .string()
          .regex(DATE)
          .describe("First day to check, YYYY-MM-DD (Asia/Taipei)"),
        days: z.number().int().min(1).max(7).default(1),
        start_hour: z
          .number()
          .int()
          .min(0)
          .max(23)
          .default(DAY_WINDOW.startHour)
          .describe("Asia/Taipei hour the day starts being checked"),
        end_hour: z
          .number()
          .int()
          .min(1)
          .max(24)
          .default(DAY_WINDOW.endHour)
          .describe("Asia/Taipei hour the day stops being checked"),
      }),
    },
    async ({ date, days, start_hour, end_hour }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        if (end_hour <= start_hour) {
          throw new Error("end_hour must be later than start_hour")
        }
        const supabase = createUserClient(caller.token)
        const lastDay = addDays(date, days - 1)

        const [availability, bookings] = await Promise.all([
          fetchAvailabilityRange(date, days, {
            startHour: start_hour,
            endHour: end_hour,
            slotMinutes: DAY_WINDOW.slotMinutes,
          }),
          fetchPortalBookingsInRange(supabase, date, lastDay),
        ])

        const labBookings = bookings.filter(
          (b) => b.status === "booked" && b.room !== null
        )
        return json({
          from: date,
          to: lastDay,
          window: { start: hour(start_hour), end: hour(end_hour) },
          days: availability.map((day) => ({
            date: day.date,
            runs: mergeRuns(day.slots),
            lab_bookings: labBookings
              .filter((b) => b.date === day.date)
              .map((b) => ({
                room: b.room,
                start_time: hhmm(b.startTime),
                end_time: hhmm(b.endTime),
                title: b.title,
                requested_by_name: b.requestedByName,
              })),
          })),
          url: `${PORTAL_URL}/rooms`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "list_room_bookings",
    {
      title: "List portal room bookings",
      description: `The bookings Portal made through the lab's shared department account (/rooms), for date and the days after it: room (null when the meeting is online only), date, start and end time, status, who requested it and what it is for. Every member sees every booking, cancelled rows included, so a cancelled row is a fact rather than a gap; nothing here is admin-only. The member's own bookings can be cancelled with cancel_room_booking.`,
      inputSchema: z.object({
        date: z
          .string()
          .regex(DATE)
          .optional()
          .describe("First day, YYYY-MM-DD; defaults to today (Asia/Taipei)"),
        days: z.number().int().min(1).max(90).default(7),
      }),
    },
    async ({ date, days }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const from = date ?? todayInTaipei()
        const to = addDays(from, days - 1)

        const bookings = await fetchPortalBookingsInRange(supabase, from, to)
        return json({
          from,
          to,
          count: bookings.length,
          bookings: bookings.map((b) => ({
            id: b.id,
            date: b.date,
            start_time: hhmm(b.startTime),
            end_time: hhmm(b.endTime),
            room: b.room,
            online: b.online,
            status: b.status,
            title: b.title,
            agenda: b.agenda,
            requested_by: b.requestedBy,
            requested_by_name: b.requestedByName,
            attendee_count: b.attendees.length,
            cancelled_at: b.cancelledAt,
            meeting_status: b.meeting?.status ?? null,
            join_url: b.meeting?.joinUrl ?? null,
          })),
          url: `${PORTAL_URL}/rooms`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "book_room",
    {
      title: "Book room",
      description: `Books a CS department meeting room through the lab's shared account, the 確認預約 button on /rooms, with the member as organizer. As on the page, the member does not pick the room: the tool takes the one /rooms would, open for the whole span, free before paid, and a paid room (the department charges for it) is only booked with allow_paid true. online_only books no room at all. Every booking also gets a Teams meeting in the WinLab channel that is recorded automatically, with a transcript and an AI summary everyone in the channel can see, and every attendee gets a calendar invite by mail. Times are Asia/Taipei HH:MM on the 30-minute grid between 08:00 and 22:00; check list_room_availability first. attendees are portal user ids, emails or Keycloak usernames. group is a project group from the /rooms group buttons: its members are invited too unless invite_group_members is false, and it names the project the recording files under (without a group, the first attendee's username does). include_advisor has no default because it mails the advisor. Do not book the Monday lab seminar here; it has a standing booking. Read back the date, time, whether a room or online only, the title, the attendees, the advisor choice and the recording, and get the member's yes first. Cancel with cancel_room_booking.`,
      inputSchema: z.object({
        date: z.iso.date().describe("Meeting date in Asia/Taipei"),
        start_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "expected HH:MM")
          .describe("Start, HH:MM on the 30-minute grid"),
        end_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/, "expected HH:MM")
          .describe("End, HH:MM on the 30-minute grid"),
        online_only: z
          .boolean()
          .default(false)
          .describe("A Teams meeting with no room, as the page's 線上會議"),
        allow_paid: z
          .boolean()
          .default(false)
          .describe("Accept a paid room when no free room is open"),
        title: z
          .string()
          .trim()
          .min(1)
          .max(80)
          .default(DEFAULT_TOPIC_SUFFIX)
          .describe("What the meeting is called, after the project prefix"),
        attendees: z
          .array(z.string().trim().min(1))
          .max(50)
          .describe("Members to invite, by user id, email or username"),
        include_advisor: z
          .boolean()
          .describe("Invite the advisor, as the /rooms checkbox (on there)"),
        group: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Project group name from the /rooms group buttons"),
        invite_group_members: z
          .boolean()
          .default(true)
          .describe("With group: invite everyone in it"),
        agenda: z
          .string()
          .trim()
          .max(2000)
          .optional()
          .describe("What the meeting is for"),
        epic_iid: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("With group: the GitLab epic this meeting belongs to"),
      }),
    },
    async (args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        if (!hooks.bookRoom) {
          throw new Error("room booking is not connected to this server")
        }
        if (args.date < todayInTaipei()) {
          throw new Error(`${args.date} is in the past in Asia/Taipei`)
        }
        if (args.epic_iid !== undefined && !args.group) {
          throw new Error("epic_iid needs the group the epic belongs to")
        }
        const supabase = createUserClient(caller.token)
        const members = await fetchLabMembers(supabase)
        let attendees = resolveAttendees(members, args.attendees)

        let groupName: string | null = null
        if (args.group) {
          const result = await fetchAttendeeGroups()
          if (result.status !== "ok") {
            throw new Error(
              `the project groups could not be read (${result.status}${"detail" in result ? `: ${result.detail}` : ""}); book without a group or try later`
            )
          }
          const groups = toPickableGroups(result.groups)
          const wanted = args.group.toLowerCase()
          const group = groups.find((g) => g.name.toLowerCase() === wanted)
          if (!group) {
            throw new Error(
              `no project group named ${args.group}; the groups are ${groups.map((g) => g.name).join(", ")}`
            )
          }
          groupName = group.name
          if (args.invite_group_members) {
            attendees = mergeAttendees(attendees, group.members)
          }
        }

        if (args.include_advisor) {
          const advisor = advisorContact(members)
          if (!advisor) throw new Error("the advisor has no portal account")
          attendees = mergeAttendees(attendees, [advisor])
        }

        let room: string | null = null
        let tier: "free" | "paid" | null = null
        if (!args.online_only) {
          const [day] = await fetchAvailabilityRange(args.date, 1)
          const pick = roomForSpan(
            day?.slots ?? [],
            args.start_time,
            args.end_time
          )
          if (!pick) {
            throw new Error(
              `no room is open for all of ${args.date} ${args.start_time}-${args.end_time}; list_room_availability shows the open times, or book it online_only`
            )
          }
          if (pick.tier === "paid" && !args.allow_paid) {
            throw new Error(
              `only a paid room (${pick.room}) is open for that span and the department charges for it; ask the member, then call again with allow_paid true, or choose another time`
            )
          }
          room = pick.room
          tier = pick.tier
        }

        const result = await hooks.bookRoom(caller, {
          date: args.date,
          room,
          startTime: args.start_time,
          endTime: args.end_time,
          titleSuffix: args.title,
          attendees,
          groupName,
          agenda: args.agenda || null,
          issueRefs: args.epic_iid ? [`&${args.epic_iid}`] : [],
        })
        if (result.error) {
          // placeBooking's one failure after the department already holds
          // the room: booking again would reserve a second one.
          throw new Error(
            result.error.includes("已在外部系統訂到教室")
              ? `${result.error} Do not call book_room again for this meeting; tell the member an admin has to record it.`
              : result.error
          )
        }

        const prefix = topicPrefix({
          groupName,
          firstAttendeeUsername: attendees.find((a) => a.username)?.username,
        })
        return json({
          booked: true,
          booking_id: result.bookingId ?? null,
          room,
          room_tier: tier,
          online_only: room === null,
          date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
          title: composeTopic(prefix, args.title),
          attendees: attendees.map((a) => ({ name: a.name, email: a.email })),
          invites: result.inviteError
            ? `not sent: ${result.inviteError}`
            : "sent",
          teams: "the meeting link is added by the pipeline within minutes",
          url: `${PORTAL_URL}/rooms`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )

  server.registerTool(
    "cancel_room_booking",
    {
      title: "Cancel room booking",
      description:
        "Cancels one of the member's own bookings made through /rooms, the cancel button on it: releases the room on the department system (nothing to release for an online-only meeting), marks the Portal booking cancelled, asks the pipeline to take down its Teams meeting and mails every attendee the cancellation. Only the member who booked it can cancel it, as on the web. Get the id from list_room_bookings and confirm the booking with the member first.",
      inputSchema: z.object({
        booking_id: z
          .uuid()
          .describe("Booking id from list_room_bookings or book_room"),
      }),
    },
    async ({ booking_id }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        if (!hooks.cancelRoomBooking) {
          throw new Error("room booking is not connected to this server")
        }
        const result = await hooks.cancelRoomBooking(caller, booking_id)
        if (result.error) throw new Error(result.error)
        return json({
          cancelled: true,
          booking_id,
          cancellation_mail: result.inviteError
            ? `not sent: ${result.inviteError}`
            : "sent",
          url: `${PORTAL_URL}/rooms`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
