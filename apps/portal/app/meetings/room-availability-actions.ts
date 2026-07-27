"use server"

// Proxies the CS department's meeting-room system server-side: the browser
// can't call it directly (that origin doesn't send CORS headers for
// portal.winlab.tw), and doing the fetch here keeps the reverse-engineered
// API details (see lib/meetingroom/client.ts) off the client bundle.

import {
  computeDayAvailability,
  type AvailabilitySlot,
} from "@/lib/meetingroom/availability"
import { fetchBusySlotsForRooms, fetchRooms } from "@/lib/meetingroom/client"

const DAY_WINDOW = { startHour: 8, endHour: 22, slotMinutes: 30 }

export async function getRoomAvailability(
  date: string
): Promise<AvailabilitySlot[]> {
  const rooms = await fetchRooms()
  const busy = await fetchBusySlotsForRooms(
    rooms.filter((r) => r.active).map((r) => r.name),
    date
  )
  return computeDayAvailability(rooms, busy, date, DAY_WINDOW)
}
