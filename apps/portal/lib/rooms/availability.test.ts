import { describe, expect, test } from "bun:test"

import {
  computeDayAvailability,
  slotTier,
  suggestRoom,
  type AvailabilitySlot,
} from "./availability"
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
      labRooms: [],
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
          subscriber: "someone",
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
          subscriber: "someone",
        },
        {
          room: "500B",
          start: "2026-08-01T01:00:00.000Z",
          end: "2026-08-01T02:00:00.000Z",
          subscriber: "someone",
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
          subscriber: "someone",
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
          subscriber: "someone",
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.freeRooms).toContain("500A")
  })

  test("a room booked by the lab account shows up in labRooms, not just missing from freeRooms", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T01:00:00.000Z",
          end: "2026-08-01T02:00:00.000Z",
          subscriber: "cctseng",
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.labRooms).toEqual(["500A"])
    expect(slots[0]!.freeRooms).toEqual(["500B"])
  })

  test("a room booked by someone else never appears in labRooms", () => {
    const slots = computeDayAvailability(
      ROOMS,
      [
        {
          room: "500A",
          start: "2026-08-01T01:00:00.000Z",
          end: "2026-08-01T02:00:00.000Z",
          subscriber: "someone-else",
        },
      ],
      "2026-08-01",
      OPTS
    )
    expect(slots[0]!.labRooms).toEqual([])
  })
})

describe("slotTier", () => {
  test("lab wins outright, even over a free-tier room open elsewhere", () => {
    expect(
      slotTier({ freeRooms: [], paidRooms: ["334"], labRooms: ["500A"] })
    ).toBe("lab")
    expect(
      slotTier({ freeRooms: ["500B"], paidRooms: [], labRooms: ["500A"] })
    ).toBe("lab")
  })

  test("free when no lab room, but a free-tier room is open", () => {
    expect(
      slotTier({ freeRooms: ["500A"], paidRooms: ["334"], labRooms: [] })
    ).toBe("free")
  })

  test("paid-only when no free-tier or lab room, but a paid one is open", () => {
    expect(slotTier({ freeRooms: [], paidRooms: ["334"], labRooms: [] })).toBe(
      "paid-only"
    )
  })

  test("none when nothing is open", () => {
    expect(slotTier({ freeRooms: [], paidRooms: [], labRooms: [] })).toBe(
      "none"
    )
  })
})

describe("suggestRoom", () => {
  // Each slot is progressively more booked out: by index 4 nothing is left.
  const daySlots: AvailabilitySlot[] = [
    {
      start: "09:00",
      end: "09:30",
      freeRooms: ["500A", "600A"],
      paidRooms: [],
      labRooms: [],
    },
    {
      start: "09:30",
      end: "10:00",
      freeRooms: ["500A", "600A"],
      paidRooms: [],
      labRooms: [],
    },
    {
      start: "10:00",
      end: "10:30",
      freeRooms: ["500A"],
      paidRooms: [],
      labRooms: [],
    },
    {
      start: "10:30",
      end: "11:00",
      freeRooms: [],
      paidRooms: ["334"],
      labRooms: [],
    },
    {
      start: "11:00",
      end: "11:30",
      freeRooms: [],
      paidRooms: [],
      labRooms: [],
    },
  ]

  test("prefers the free tier, and within it the room-number priority (600 over 500)", () => {
    expect(suggestRoom(daySlots, 0, 1)).toEqual({ room: "600A", tier: "free" })
  })

  test("a room only qualifies if it stays open across the whole span", () => {
    // 600A drops out of freeRooms in the third slot, so a 3-slot booking
    // starting at index 0 can't use it — only 500A spans all three.
    expect(suggestRoom(daySlots, 0, 3)).toEqual({ room: "500A", tier: "free" })
  })

  test("falls back to the paid tier once no free-tier room spans the duration", () => {
    expect(suggestRoom(daySlots, 3, 1)).toEqual({ room: "334", tier: "paid" })
  })

  test("returns null when nothing is open for the full span", () => {
    expect(suggestRoom(daySlots, 4, 1)).toBeNull()
  })

  test("returns null when the duration runs past the end of the day", () => {
    expect(suggestRoom(daySlots, 4, 2)).toBeNull()
  })

  // Floor, then room number ascending, then the trailing letter reversed.
  describe("room ordering", () => {
    const oneSlot = (freeRooms: string[]): AvailabilitySlot[] => [
      { start: "09:00", end: "09:30", freeRooms, paidRooms: [], labRooms: [] },
    ]
    const pick = (rooms: string[]) => suggestRoom(oneSlot(rooms), 0, 1)?.room

    // 6 first, 7 last; everything else descends in between.
    test("the floor decides first", () => {
      expect(pick(["500A", "600A"])).toBe("600A")
      expect(pick(["600A", "700A"])).toBe("600A")
      expect(pick(["100A", "700A"])).toBe("100A")
      expect(pick(["345", "513"])).toBe("513")
      expect(pick(["203", "410"])).toBe("410")
    })

    test("within a floor, the lower room number wins", () => {
      expect(pick(["610", "600"])).toBe("600")
      expect(pick(["513", "500B"])).toBe("500B")
      expect(pick(["ES705", "700A"])).toBe("700A")
    })

    // Reversed on purpose, and only once two rooms already share a number.
    test("the later letter wins inside the same room number", () => {
      expect(pick(["600A", "600B"])).toBe("600B")
      expect(pick(["600B", "600A"])).toBe("600B")
      expect(pick(["600A", "600C", "600B"])).toBe("600C")
    })

    test("a worse floor is never pulled ahead by its letter", () => {
      expect(pick(["700B", "600A"])).toBe("600A")
      expect(pick(["610B", "600A"])).toBe("600A")
    })

    test("a suffixed room beats the bare number it shares", () => {
      expect(pick(["600", "600A"])).toBe("600A")
    })

    // A new seminar room needs no code change — this is the whole reason the
    // key is the floor digit rather than a list of whole room numbers.
    test("a room nobody has heard of still places by its floor", () => {
      expect(pick(["601C", "700A"])).toBe("601C")
      expect(pick(["ES705", "422"])).toBe("422")
    })

    test("something with no number at all sorts last, not first", () => {
      expect(pick(["Lounge", "700A"])).toBe("700A")
      expect(pick(["Lounge"])).toBe("Lounge")
    })
  })
})
