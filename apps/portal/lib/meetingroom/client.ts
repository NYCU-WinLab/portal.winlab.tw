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

async function getJson<T>(path: string): Promise<T> {
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
  return res.json() as Promise<T>
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
