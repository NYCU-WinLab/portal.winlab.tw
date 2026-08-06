import { describe, expect, test } from "bun:test"

import {
  MAX_WINDOW_DAYS,
  resolveWindow,
  taipeiOffsetIso,
  toFeedItem,
  type FeedRow,
} from "./bookings-feed"

const TODAY = "2026-08-06"

function row(overrides: Partial<FeedRow> = {}): FeedRow {
  return {
    id: "b1",
    date: "2026-08-18",
    start_time: "09:30",
    end_time: "11:30",
    room: "600A",
    title: "[tasa-satsim]-meeting",
    status: "booked",
    online: true,
    issue_refs: ["winlab/tasa-satsim#12"],
    group_name: "tasa-satsim",
    agenda: "review the link budget",
    ...overrides,
  }
}

const joinUrl = (id: string) => `https://portal.winlab.tw/api/rooms/join/${id}`

describe("resolveWindow", () => {
  test("defaults to a bounded window starting today", () => {
    const r = resolveWindow(null, null, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.window.from).toBe(TODAY)
    expect(r.window.to).toBe("2026-09-05")
  })

  test("honours an explicit window", () => {
    const r = resolveWindow("2026-08-01", "2026-08-31", TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.window).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })

  // Bookings are stored as Taipei calendar days, so honouring an instant
  // would misrepresent the granularity.
  test("truncates a full timestamp to its date", () => {
    const r = resolveWindow("2026-08-01T13:45:00+08:00", null, TODAY)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.window.from).toBe("2026-08-01")
  })

  test("rejects a malformed date", () => {
    expect(resolveWindow("08/01/2026", null, TODAY).ok).toBe(false)
    expect(resolveWindow(null, "next week", TODAY).ok).toBe(false)
  })

  test("rejects a reversed window", () => {
    expect(resolveWindow("2026-08-31", "2026-08-01", TODAY).ok).toBe(false)
  })

  test("a single day is a valid window", () => {
    expect(resolveWindow("2026-08-18", "2026-08-18", TODAY).ok).toBe(true)
  })

  // A missing bound must not turn into an unbounded scan.
  test("caps the span", () => {
    expect(resolveWindow("2026-01-01", "2026-12-31", TODAY).ok).toBe(false)
    const edge = resolveWindow("2026-08-01", "2026-10-30", TODAY)
    expect(edge.ok).toBe(true)
    expect(MAX_WINDOW_DAYS).toBe(90)
  })
})

describe("taipeiOffsetIso", () => {
  test("carries the offset rather than converting to UTC", () => {
    expect(taipeiOffsetIso("2026-08-18", "09:30")).toBe(
      "2026-08-18T09:30:00+08:00"
    )
  })
})

describe("toFeedItem", () => {
  test("maps a live booking", () => {
    const item = toFeedItem(row(), joinUrl)
    expect(item).toEqual({
      booking_id: "b1",
      start: "2026-08-18T09:30:00+08:00",
      end: "2026-08-18T11:30:00+08:00",
      room: "600A",
      title: "[tasa-satsim]-meeting",
      status: "confirmed",
      join_url: "https://portal.winlab.tw/api/rooms/join/b1",
      issue_refs: ["winlab/tasa-satsim#12"],
      group_name: "tasa-satsim",
      agenda: "review the link budget",
    })
  })

  // The consumer's rule is "cancelled -> rewrite the comment". It needs the
  // row to still be there to act on.
  test("a cancelled booking is reported, not omitted", () => {
    expect(toFeedItem(row({ status: "cancelled" }), joinUrl).status).toBe(
      "cancelled"
    )
  })

  test("an unknown status reads as cancelled rather than as something new", () => {
    expect(toFeedItem(row({ status: "weird" }), joinUrl).status).toBe(
      "cancelled"
    )
  })

  test("an online-only meeting reports no room", () => {
    expect(toFeedItem(row({ room: null }), joinUrl).room).toBeNull()
  })

  test("a booking with no Teams meeting has no join link", () => {
    expect(toFeedItem(row({ online: false }), joinUrl).join_url).toBeNull()
  })

  // Repeated from the trigger so a lost trigger copy is recoverable on the
  // next poll — the same reason `status` is here rather than inferred.
  test("carries the fields the trigger also sent", () => {
    const item = toFeedItem(row(), joinUrl)
    expect(item.group_name).toBe("tasa-satsim")
    expect(item.agenda).toBe("review the link budget")
  })

  test("a booking with no group reports null rather than guessing", () => {
    expect(toFeedItem(row({ group_name: null }), joinUrl).group_name).toBeNull()
  })

  // Always an array, so the consumer never branches on the field's absence.
  test("missing issue_refs comes back as an empty array", () => {
    expect(toFeedItem(row({ issue_refs: null }), joinUrl).issue_refs).toEqual(
      []
    )
  })
})
