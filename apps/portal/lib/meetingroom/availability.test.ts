import { describe, expect, test } from "bun:test"

import { computeDayAvailability } from "./availability"
import type { Room } from "./types"

const ROOMS: Room[] = [
  { name: "500A", capacity: 10, charge: 0, active: true },
  { name: "500B", capacity: 10, charge: 0, active: true },
  { name: "334", capacity: 10, charge: 15, active: true },
  { name: "OLD", capacity: 10, charge: 0, active: false },
]

const OPTS = { startHour: 9, endHour: 11, slotMinutes: 60 }

describe("computeDayAvailability", () => {
  test("with no bookings, every free-tier room is available every slot", () => {
    const slots = computeDayAvailability(ROOMS, [], "2026-08-01", OPTS)
    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({
      start: "09:00",
      end: "10:00",
      freeRooms: ["500A", "500B"],
      paidRooms: ["334"],
    })
  })

  test("inactive rooms never appear", () => {
    const slots = computeDayAvailability(ROOMS, [], "2026-08-01", OPTS)
    for (const slot of slots) {
      expect(slot.freeRooms).not.toContain("OLD")
      expect(slot.paidRooms).not.toContain("OLD")
    }
  })

  test("a booking removes only that room from that slot", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T01:00:00.000Z", // 09:00 Asia/Taipei
          end: "2026-08-01T02:00:00.000Z", // 10:00 Asia/Taipei
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.freeRooms).toEqual(["500B"])
    expect(slots[1]!.freeRooms).toEqual(["500A", "500B"])
  })

  test("the free tier can be fully booked while the paid tier still has room", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T01:00:00.000Z",
          end: "2026-08-01T02:00:00.000Z",
        },
        {
          room: "500B",
          start: "2026-08-01T01:00:00.000Z",
          end: "2026-08-01T02:00:00.000Z",
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.freeRooms).toEqual([])
    expect(slots[0]!.paidRooms).toEqual(["334"])
  })

  test("a booking that only partially overlaps a slot still blocks it", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T01:30:00.000Z", // 09:30 Asia/Taipei
          end: "2026-08-01T01:45:00.000Z", // 09:45 Asia/Taipei
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.freeRooms).toEqual(["500B"])
  })

  test("a booking that ends exactly at the slot boundary does not block it", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T00:00:00.000Z", // 08:00 Asia/Taipei
          end: "2026-08-01T01:00:00.000Z", // 09:00 Asia/Taipei
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.freeRooms).toContain("500A")
  })
})
