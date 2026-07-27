"use server"

// Proxies the CS department's meeting-room system server-side: the browser
// can't call it directly (that origin doesn't send CORS headers for
// portal.winlab.tw), and doing the fetch here keeps the reverse-engineered
// API details (see lib/rooms/client.ts) off the client bundle.

import {
  computeDayAvailability,
  type AvailabilitySlot,
} from "@/lib/rooms/availability"
import { fetchBusySlotsForDates, fetchRooms } from "@/lib/rooms/client"
import { addDays } from "@/lib/rooms/date"

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
