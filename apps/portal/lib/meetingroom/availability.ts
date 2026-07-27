// Pure "is anything free" logic — no React, no I/O, unit-testable.
//
// The lab doesn't care *which* room is free (see the feature request this
// implements), just whether the 免費 (charge = 0) tier has an opening, with
// the paid tier shown as a de-emphasized fallback. So the output is one
// merged timeline per tier, not a per-room grid.

import type { BusySlot, Room } from "./types"

export interface AvailabilitySlot {
  /** "HH:mm", Asia/Taipei local time. */
  start: string
  end: string
  freeRooms: string[]
  paidRooms: string[]
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

  const busyByRoom = new Map<string, { start: Date; end: Date }[]>()
  for (const slot of busySlots) {
    const entry = busyByRoom.get(slot.room) ?? []
    entry.push({ start: new Date(slot.start), end: new Date(slot.end) })
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
    })
  }

  return slots
}
