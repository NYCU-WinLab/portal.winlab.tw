"use server"

// Proxies the CS department's meeting-room system server-side: the browser
// can't call it directly (that origin doesn't send CORS headers for
// portal.winlab.tw), and doing the fetch here keeps the reverse-engineered
// API details (see lib/rooms/client.ts) off the client bundle.

import {
  computeDayAvailability,
  type AvailabilitySlot,
} from "@/lib/rooms/availability"
import { fetchBusySlotsForRooms, fetchRooms } from "@/lib/rooms/client"
import { addDays } from "@/lib/rooms/date"

const DAY_WINDOW = { startHour: 8, endHour: 22, slotMinutes: 30 }

export interface DayAvailability {
  date: string
  slots: AvailabilitySlot[]
}

/**
 * `days` calendar days starting at `startDate`. Fetched one date at a time
 * (each date itself parallel across rooms) rather than all-at-once — this
 * queries a university system we don't own, and a 14-room x 14-day burst of
 * concurrent requests is a worse citizen than ~14 sequential batches.
 */
export async function getRoomAvailabilityRange(
  startDate: string,
  days: number
): Promise<DayAvailability[]> {
  const rooms = await fetchRooms()
  const activeRoomNames = rooms.filter((r) => r.active).map((r) => r.name)

  const result: DayAvailability[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i)
    const busy = await fetchBusySlotsForRooms(activeRoomNames, date)
    result.push({
      date,
      slots: computeDayAvailability(rooms, busy, date, DAY_WINDOW),
    })
  }
  return result
}
