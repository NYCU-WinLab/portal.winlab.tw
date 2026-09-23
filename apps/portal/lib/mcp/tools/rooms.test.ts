import { describe, expect, test } from "bun:test"

import { mergeRuns } from "@/lib/mcp/tools/rooms"
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
