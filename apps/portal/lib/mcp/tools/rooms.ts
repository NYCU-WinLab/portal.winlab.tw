import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import {
  slotTier,
  type AvailabilitySlot,
  type SlotTier,
} from "@/lib/rooms/availability"
import { addDays, todayInTaipei } from "@/lib/rooms/date"
import {
  DAY_WINDOW,
  fetchAvailabilityRange,
  fetchPortalBookingsInRange,
} from "@/lib/rooms/fetch"

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

export function registerRoomsTools(server: McpServer) {
  server.registerTool(
    "list_room_availability",
    {
      title: "List room availability",
      description: `Free and busy time in the CS department's meeting rooms (/rooms) for up to 7 days from date, as runs of the 30-minute grid the page draws: which free-tier rooms are open, which chargeable ones are, and which rooms the lab's shared account already holds. The department system is read anonymously, so every member gets the same answer and none of it is admin-only; lab_bookings adds who booked and what for, but only for the holds Portal itself made. Read-only — book at ${PORTAL_URL}/rooms, since a booking goes out through the lab's shared account.`,
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
      description: `The bookings Portal made through the lab's shared department account (/rooms), for date and the days after it: room (null when the meeting is online only), date, start and end time, status, who requested it and what it is for. Every member sees every booking, cancelled rows included, so a cancelled row is a fact rather than a gap; nothing here is admin-only. Read-only — book or cancel at ${PORTAL_URL}/rooms, where the shared account and the Teams meeting are handled.`,
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
}
