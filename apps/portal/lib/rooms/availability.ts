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

// Which floor to prefer when suggesting where to book. Keyed on the floor
// digit rather than a list of whole room numbers on purpose: the building
// can't grow storeys, but it can grow seminar rooms, so a hardcoded
// ["600", "500", …] silently drops every room nobody remembered to add.
// 7 last is a preference, not arithmetic.
const FLOOR_PRIORITY = [6, 5, 4, 3, 2, 1, 7]

interface RoomKey {
  floorRank: number
  /** The room number itself, e.g. 705 for `ES705`. */
  number: number
  /** Trailing letters only: `600A` -> `A`, `ES705` -> ``. */
  suffix: string
}

// Trailing digits plus any letters after them. Anchored at the end so a
// leading prefix (`ES705`) is ignored rather than mistaken for a suffix.
const ROOM_NUMBER = /(\d+)([A-Za-z]*)\s*$/

function roomKey(roomName: string): RoomKey {
  const match = ROOM_NUMBER.exec(roomName.trim())
  if (!match?.[1]) {
    // Nothing numeric to place it by — sorts last rather than anywhere.
    return { floorRank: FLOOR_PRIORITY.length, number: Infinity, suffix: "" }
  }

  const digits = match[1]
  const rank = FLOOR_PRIORITY.indexOf(Number(digits[0]))
  return {
    floorRank: rank === -1 ? FLOOR_PRIORITY.length : rank,
    number: Number(digits),
    suffix: match[2] ?? "",
  }
}

/**
 * Order rooms best-first: floor, then room number ascending, then the
 * trailing letter DESCENDING so 600B beats 600A.
 *
 * The reversal is N0Ball's call and applies only once two rooms already share
 * a number, so it can never pull a worse floor ahead — 700B still loses to
 * 600A.
 */
function compareRooms(a: string, b: string): number {
  const left = roomKey(a)
  const right = roomKey(b)

  if (left.floorRank !== right.floorRank) {
    return left.floorRank - right.floorRank
  }
  if (left.number !== right.number) return left.number - right.number
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
