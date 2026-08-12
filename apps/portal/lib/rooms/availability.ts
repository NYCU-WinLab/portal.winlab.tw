// Pure "is anything free" logic — no React, no I/O, unit-testable.
//
// The lab doesn't care *which* room is free (see the feature request this
// implements), just whether the 免費 (charge = 0) tier has an opening, with
// the paid tier shown as a de-emphasized fallback. So the output is one
// merged timeline per tier, not a per-room grid.

import type { BusySlot, Room } from "./types"

/**
 * The department's shared lab account this reservation system reserves
 * under. Its bookings are the lab's own, not a stranger's — worth calling
 * out separately from "someone else has this room."
 */
const LAB_SUBSCRIBER = "cctseng"

export interface AvailabilitySlot {
  /** "HH:mm", Asia/Taipei local time. */
  start: string
  end: string
  freeRooms: string[]
  paidRooms: string[]
  /** Rooms busy in this slot because the lab's own account booked them. */
  labRooms: string[]
}

export interface AvailabilityOptions {
  /** Local Asia/Taipei hour the day starts being checked, e.g. 8. */
  startHour: number
  /** Local Asia/Taipei hour the day stops being checked, e.g. 22. */
  endHour: number
  /** Slot granularity in minutes, e.g. 30. */
  slotMinutes: number
}

function taipeiTime(date: string, hour: number, minute: number): Date {
  const hh = String(hour).padStart(2, "0")
  const mm = String(minute).padStart(2, "0")
  return new Date(`${date}T${hh}:${mm}:00+08:00`)
}

function formatHHmm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * One merged free/busy timeline per pricing tier for a single calendar day.
 * `date` is a YYYY-MM-DD Asia/Taipei calendar day.
 */
export function computeDayAvailability(
  rooms: Room[],
  busySlots: BusySlot[],
  date: string,
  opts: AvailabilityOptions
): AvailabilitySlot[] {
  const active = rooms.filter((r) => r.active)
  const freeTier = active.filter((r) => r.charge === 0)
  const paidTier = active.filter((r) => r.charge > 0)

  const busyByRoom = new Map<
    string,
    { start: Date; end: Date; subscriber: string }[]
  >()
  for (const slot of busySlots) {
    const entry = busyByRoom.get(slot.room) ?? []
    entry.push({
      start: new Date(slot.start),
      end: new Date(slot.end),
      subscriber: slot.subscriber,
    })
    busyByRoom.set(slot.room, entry)
  }

  function freeRoomsInWindow(tier: Room[], start: Date, end: Date): string[] {
    return tier
      .filter((room) => {
        const busy = busyByRoom.get(room.name) ?? []
        return !busy.some((b) => overlaps(start, end, b.start, b.end))
      })
      .map((room) => room.name)
  }

  function labRoomsInWindow(tier: Room[], start: Date, end: Date): string[] {
    return tier
      .filter((room) => {
        const busy = busyByRoom.get(room.name) ?? []
        return busy.some(
          (b) =>
            overlaps(start, end, b.start, b.end) &&
            b.subscriber === LAB_SUBSCRIBER
        )
      })
      .map((room) => room.name)
  }

  const slots: AvailabilitySlot[] = []
  const totalMinutes = (opts.endHour - opts.startHour) * 60
  for (let m = 0; m < totalMinutes; m += opts.slotMinutes) {
    const startHour = opts.startHour + Math.floor(m / 60)
    const startMinute = m % 60
    const endTotal = m + opts.slotMinutes
    const endHour = opts.startHour + Math.floor(endTotal / 60)
    const endMinute = endTotal % 60

    const start = taipeiTime(date, startHour, startMinute)
    const end = taipeiTime(date, endHour, endMinute)

    slots.push({
      start: formatHHmm(startHour, startMinute),
      end: formatHHmm(endHour, endMinute),
      freeRooms: freeRoomsInWindow(freeTier, start, end),
      paidRooms: freeRoomsInWindow(paidTier, start, end),
      labRooms: labRoomsInWindow(active, start, end),
    })
  }

  return slots
}

export type SlotTier = "free" | "lab" | "paid-only" | "none"

/**
 * Which of the four at-a-glance states a slot is in. "lab" wins outright,
 * even over a free-tier opening elsewhere — the lab already having a room in
 * this slot is the single most useful thing to know, ahead of "you could
 * also book a different one."
 */
export function slotTier(
  slot: Pick<AvailabilitySlot, "freeRooms" | "paidRooms" | "labRooms">
): SlotTier {
  if (slot.labRooms.length > 0) return "lab"
  if (slot.freeRooms.length > 0) return "free"
  if (slot.paidRooms.length > 0) return "paid-only"
  return "none"
}

// Room-selection priority when suggesting where to book: free tier before
// paid, and within a tier, prefer by room-number prefix in this order.
// Deliberately not numeric — 700 sits last by choice, not by arithmetic.
const ROOM_PREFIX_PRIORITY = ["600", "500", "300", "200", "100", "700"]

function roomPriorityRank(roomName: string): number {
  const rank = ROOM_PREFIX_PRIORITY.findIndex((prefix) =>
    roomName.startsWith(prefix)
  )
  return rank === -1 ? ROOM_PREFIX_PRIORITY.length : rank
}

/**
 * A room name split into the part that decides its rank and the trailing
 * letters that break ties within it: `600A` -> `600` + `A`, `ES705` -> the
 * whole thing with no suffix, since those letters lead rather than trail.
 */
function splitRoomName(roomName: string): { base: string; suffix: string } {
  const match = /^(.*?)([A-Za-z]*)$/.exec(roomName.trim())
  return { base: match?.[1] ?? roomName, suffix: match?.[2] ?? "" }
}

/**
 * Order rooms best-first.
 *
 * Three keys, in this order:
 *
 * 1. The prefix priority list above.
 * 2. The room number, ascending — only to keep rooms the list doesn't name
 *    (345, 513, ES705) in a stable, predictable order rather than whatever
 *    order the department's API happened to return them in.
 * 3. The trailing letter, DESCENDING: 600B beats 600A. Reversed on purpose
 *    (N0Ball's call) and only within one room number, so it can never pull a
 *    lower-priority number ahead of a higher one — 700B still loses to 600A.
 */
function compareRooms(a: string, b: string): number {
  const rank = roomPriorityRank(a) - roomPriorityRank(b)
  if (rank !== 0) return rank

  const left = splitRoomName(a)
  const right = splitRoomName(b)
  if (left.base !== right.base) return left.base.localeCompare(right.base)
  return right.suffix.localeCompare(left.suffix)
}

function bestByPriority(roomNames: string[]): string | undefined {
  return [...roomNames].sort(compareRooms)[0]
}

export interface RoomSuggestion {
  room: string
  tier: "free" | "paid"
}

/**
 * The room to request for a `durationSlots`-slot booking starting at
 * `daySlots[startIndex]`. A room only qualifies if it's open across every
 * slot in that span — a booking can't straddle a gap — then the free tier
 * wins over paid, and ties break by room-number priority.
 */
export function suggestRoom(
  daySlots: AvailabilitySlot[],
  startIndex: number,
  durationSlots: number
): RoomSuggestion | null {
  const span = daySlots.slice(startIndex, startIndex + durationSlots)
  if (span.length < durationSlots) return null

  function openAcrossSpan(pickRooms: (slot: AvailabilitySlot) => string[]) {
    return span.reduce<string[] | null>(
      (acc, slot) =>
        acc === null
          ? pickRooms(slot)
          : acc.filter((r) => pickRooms(slot).includes(r)),
      null
    )
  }

  const bestFree = bestByPriority(openAcrossSpan((s) => s.freeRooms) ?? [])
  if (bestFree) return { room: bestFree, tier: "free" }

  const bestPaid = bestByPriority(openAcrossSpan((s) => s.paidRooms) ?? [])
  if (bestPaid) return { room: bestPaid, tier: "paid" }

  return null
}
