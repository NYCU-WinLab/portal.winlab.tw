import { describe, expect, test } from "bun:test"

import {
  advisorContact,
  mergeRuns,
  resolveAttendees,
  roomForSpan,
} from "@/lib/mcp/tools/rooms"
import type { LabMember } from "@/lib/rooms/fetch"
import type { AvailabilitySlot } from "@/lib/rooms/availability"

function slot(
  start: string,
  end: string,
  rooms: Partial<Pick<AvailabilitySlot, "freeRooms" | "paidRooms" | "labRooms">>
): AvailabilitySlot {
  return {
    start,
    end,
    freeRooms: rooms.freeRooms ?? [],
    paidRooms: rooms.paidRooms ?? [],
    labRooms: rooms.labRooms ?? [],
  }
}

describe("mergeRuns", () => {
  test("collapses consecutive slots with identical rooms", () => {
    const runs = mergeRuns([
      slot("08:00", "08:30", { freeRooms: ["600A"] }),
      slot("08:30", "09:00", { freeRooms: ["600A"] }),
      slot("09:00", "09:30", { freeRooms: ["600A"] }),
    ])

    expect(runs).toEqual([
      {
        start: "08:00",
        end: "09:30",
        tier: "free",
        free_rooms: ["600A"],
        paid_rooms: [],
        lab_rooms: [],
      },
    ])
  })

  test("splits when the room list changes, even at the same tier", () => {
    const runs = mergeRuns([
      slot("08:00", "08:30", { freeRooms: ["600A", "345"] }),
      slot("08:30", "09:00", { freeRooms: ["600A"] }),
    ])

    expect(runs.map((r) => [r.start, r.end, r.free_rooms])).toEqual([
      ["08:00", "08:30", ["600A", "345"]],
      ["08:30", "09:00", ["600A"]],
    ])
  })

  test("labels each run with the tier the page colours it by", () => {
    const runs = mergeRuns([
      slot("08:00", "08:30", { freeRooms: ["600A"], labRooms: ["345"] }),
      slot("08:30", "09:00", { paidRooms: ["705"] }),
      slot("09:00", "09:30", {}),
    ])

    expect(runs.map((r) => r.tier)).toEqual(["lab", "paid-only", "none"])
  })

  test("keeps a gap between non-adjacent slots apart", () => {
    const runs = mergeRuns([
      slot("08:00", "08:30", { freeRooms: ["600A"] }),
      slot("09:00", "09:30", { freeRooms: ["600A"] }),
    ])

    expect(runs).toHaveLength(2)
  })

  test("has nothing to merge in an empty day", () => {
    expect(mergeRuns([])).toEqual([])
  })
})

const MEMBERS: LabMember[] = [
  { id: "u1", name: "詹詠翔", email: "loki@winlab.tw", username: "zyx1121" },
  { id: "u2", name: "Mike", email: "mike@winlab.tw", username: null },
  { id: "u3", name: "No Mail", email: null, username: "nomail" },
  { id: "u4", name: "曾建超", email: "cc@winlab.tw", username: "cctseng" },
]

describe("resolveAttendees", () => {
  test("matches an id, an email or a username, keeping the username", () => {
    expect(
      resolveAttendees(MEMBERS, ["ZYX1121", "mike@winlab.tw", "u4"])
    ).toEqual([
      { name: "詹詠翔", email: "loki@winlab.tw", username: "zyx1121" },
      { name: "Mike", email: "mike@winlab.tw" },
      { name: "曾建超", email: "cc@winlab.tw" },
    ])
  })

  test("lists each member once", () => {
    expect(resolveAttendees(MEMBERS, ["u1", "loki@winlab.tw"])).toHaveLength(1)
  })

  test("refuses someone who is not a member", () => {
    expect(() => resolveAttendees(MEMBERS, ["stranger@x.com"])).toThrow(
      /no member matches stranger@x.com/
    )
  })

  test("refuses a member with no email, who could not get the invite", () => {
    expect(() => resolveAttendees(MEMBERS, ["nomail"])).toThrow(
      /No Mail has no email/
    )
  })
})

describe("advisorContact", () => {
  test("adds the advisor by email only, as the /rooms page does", () => {
    expect(advisorContact(MEMBERS)).toEqual({
      name: "曾建超",
      email: "cc@winlab.tw",
    })
  })

  test("is null when the advisor has no account", () => {
    expect(advisorContact(MEMBERS.slice(0, 2))).toBeNull()
  })
})

describe("roomForSpan", () => {
  const day = [
    slot("10:00", "10:30", { freeRooms: ["600A"], paidRooms: ["334"] }),
    slot("10:30", "11:00", { freeRooms: ["600A"], paidRooms: ["334"] }),
    slot("11:00", "11:30", { freeRooms: [], paidRooms: ["334"] }),
  ]

  test("takes the free room open for the whole span", () => {
    expect(roomForSpan(day, "10:00", "11:00")).toEqual({
      room: "600A",
      tier: "free",
    })
  })

  test("falls back to a paid room only when no free one covers it", () => {
    expect(roomForSpan(day, "10:00", "11:30")).toEqual({
      room: "334",
      tier: "paid",
    })
  })

  test("refuses a span off the grid", () => {
    expect(() => roomForSpan(day, "10:15", "11:00")).toThrow(/30-minute grid/)
  })
})
