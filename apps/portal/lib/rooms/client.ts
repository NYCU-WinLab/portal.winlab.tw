// Server-only client for the CS department's meeting room booking system
// (https://www.cs.nycu.edu.tw/csauto/meetingroom/). This is NOT an official
// API — no docs, no version guarantee — reverse-engineered from that site's
// shipped Angular JS (public/js/reservation.js, public/js/manage_user.js).
// Room listing and per-room/date reservation queries are unauthenticated (the
// site itself serves them to anonymous "訪客" visitors), so this file only
// covers read access. Booking/cancel would need a stored service-account
// login and is deliberately out of scope for now.

const BASE = "https://www.cs.nycu.edu.tw/csauto/meetingroom"

interface RawRoom {
  name: string
  people: string
  type: "short" | "long"
  charge: string
  inactive: string
}

interface RawReservation {
  room: string
  start: string
  end: string
}

import type { BusySlot, Room } from "./types"

// A range query fans out to dozens of these in flight (see
// fetchBusySlotsForDates below); at that volume, this system's occasional
// transient timeout (observed live: a 504 on an otherwise-healthy request)
// would otherwise take down the whole range with it. One retry after a short
// backoff is enough to ride those out without masking a real outage.
async function getJson<T>(path: string, attempt = 0): Promise<T> {
  try {
    const res = await fetch(`${BASE}/${path}`, {
      headers: { Accept: "application/json" },
      // Room list barely changes; per-date reservations change often but a
      // short revalidate window keeps the external site from being hammered
      // by every page load.
      next: { revalidate: 60 },
    })
    if (!res.ok) {
      throw new Error(`meetingroom API ${path} failed: ${res.status}`)
    }
    return (await res.json()) as T
  } catch (err) {
    if (attempt >= 2) throw err
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
    return getJson<T>(path, attempt + 1)
  }
}

export async function fetchRooms(): Promise<Room[]> {
  const raw = await getJson<RawRoom[]>("reservation/room/get")
  return raw.map((r) => ({
    name: r.name,
    capacity: Number(r.people),
    charge: Number(r.charge),
    active: r.inactive === "0",
  }))
}

/** `date` is a YYYY-MM-DD calendar day. */
export async function fetchBusySlots(
  room: string,
  date: string
): Promise<BusySlot[]> {
  const raw = await getJson<RawReservation[]>(
    `reservation/get/${encodeURIComponent(room)}/${date}`
  )
  return raw.map((r) => ({
    room: r.room,
    start: new Date(Number(r.start)).toISOString(),
    end: new Date(Number(r.end)).toISOString(),
  }))
}

export async function fetchBusySlotsForRooms(
  rooms: string[],
  date: string
): Promise<BusySlot[]> {
  const perRoom = await Promise.all(
    rooms.map((room) => fetchBusySlots(room, date))
  )
  return perRoom.flat()
}

// There's no bulk "all rooms for one date" endpoint on this system (checked
// its shipped JS — the only reservation route is per-room, per-date), so a
// multi-day query is inherently rooms x dates requests. Running every date
// fully sequentially was safe but slow (~450ms/date, ~6s for 14 days);
// running all of them at once is a bigger burst than a university system we
// don't own deserves. This caps how many dates are in flight at once, each
// still fanning out across rooms in parallel underneath.
const DATE_CONCURRENCY = 4

export async function fetchBusySlotsForDates(
  rooms: string[],
  dates: string[]
): Promise<Map<string, BusySlot[]>> {
  const result = new Map<string, BusySlot[]>()
  for (let i = 0; i < dates.length; i += DATE_CONCURRENCY) {
    const batch = dates.slice(i, i + DATE_CONCURRENCY)
    const busyPerDate = await Promise.all(
      batch.map((date) => fetchBusySlotsForRooms(rooms, date))
    )
    batch.forEach((date, idx) => result.set(date, busyPerDate[idx]!))
  }
  return result
}
