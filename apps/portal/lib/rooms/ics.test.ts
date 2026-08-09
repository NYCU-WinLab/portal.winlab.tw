import { describe, expect, test } from "bun:test"

import { buildCalendarInvite, type CalendarEvent } from "./ics"

/** Reverse RFC 5545 line folding, so assertions can read logical lines. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "")
}

const BASE: CalendarEvent = {
  uid: "booking-123@portal.winlab.tw",
  title: "Weekly sync",
  room: "600A",
  start: "2026-08-01T02:00:00.000Z",
  end: "2026-08-01T03:00:00.000Z",
  organizer: { name: "Loki", email: "loki@example.com" },
  attendees: [{ name: "Tim", email: "tim@example.com" }],
  sequence: 0,
  method: "REQUEST",
}

describe("buildCalendarInvite", () => {
  test("emits a REQUEST with the event's times as UTC ICS stamps", () => {
    const ics = buildCalendarInvite(BASE)
    expect(ics).toContain("METHOD:REQUEST")
    expect(ics).toContain("DTSTART:20260801T020000Z")
    expect(ics).toContain("DTEND:20260801T030000Z")
    expect(ics).toContain("STATUS:CONFIRMED")
  })

  test("marks attendees as needing an RSVP so clients show accept/decline", () => {
    expect(unfold(buildCalendarInvite(BASE))).toContain(
      "ATTENDEE;CN=Tim;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:tim@example.com"
    )
  })

  test("a CANCEL reuses the uid and flips STATUS, so clients drop the event", () => {
    const ics = buildCalendarInvite({ ...BASE, method: "CANCEL", sequence: 1 })
    expect(ics).toContain("METHOD:CANCEL")
    expect(ics).toContain("STATUS:CANCELLED")
    expect(ics).toContain("UID:booking-123@portal.winlab.tw")
    expect(ics).toContain("SEQUENCE:1")
  })

  test("escapes RFC 5545 special characters in free text", () => {
    const ics = buildCalendarInvite({ ...BASE, title: "A; B, C\\D" })
    expect(ics).toContain("SUMMARY:A\\; B\\, C\\\\D")
  })

  test("uses CRLF line endings", () => {
    expect(buildCalendarInvite(BASE)).toContain("\r\n")
  })

  test("folds long lines without splitting a multi-byte character", () => {
    // 40 Chinese chars = 120 bytes in the SUMMARY value alone, so this must fold.
    const title = "會".repeat(40)
    const ics = buildCalendarInvite({ ...BASE, title })
    const summaryBlock = ics.split("\r\n").slice(
      ics.split("\r\n").findIndex((l) => l.startsWith("SUMMARY:")),
      ics.split("\r\n").findIndex((l) => l.startsWith("LOCATION:"))
    )

    // Every physical line stays within the 75-octet limit...
    for (const line of summaryBlock) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75)
    }
    // ...and unfolding restores the original title intact (no mojibake).
    const unfolded = summaryBlock
      .map((l, i) => (i === 0 ? l : l.slice(1)))
      .join("")
    expect(unfolded).toBe(`SUMMARY:${title}`)
  })
})

describe("join link", () => {
  const base = {
    uid: "rooms-abc@portal.winlab.tw",
    title: "週會",
    room: "600A",
    start: "2026-08-01T02:00:00.000Z",
    end: "2026-08-01T03:00:00.000Z",
    organizer: { name: "Loki", email: "loki@winlab.tw" },
    attendees: [{ name: "N0Ball", email: "n0ball@winlab.tw" }],
    sequence: 0,
    method: "REQUEST" as const,
  }

  test("carries the join link in DESCRIPTION and URL", () => {
    const ics = buildCalendarInvite({
      ...base,
      joinUrl: "https://portal.winlab.tw/api/rooms/join/abc",
    })
    expect(ics).toContain("URL:https://portal.winlab.tw/api/rooms/join/abc")
    expect(ics).toContain("DESCRIPTION:")
  })

  // Outlook builds its "Join" button from this property and expects a real
  // teams.microsoft.com URL. Ours is a redirect, so it must not claim to be
  // a Teams meeting URL.
  test("does not claim the redirect is a Teams meeting URL", () => {
    const ics = buildCalendarInvite({
      ...base,
      joinUrl: "https://portal.winlab.tw/api/rooms/join/abc",
    })
    expect(ics).not.toContain("X-MICROSOFT-SKYPETEAMSMEETINGURL")
  })

  test("omits both fields when there's no link", () => {
    const ics = buildCalendarInvite({ ...base, joinUrl: null })
    expect(ics).not.toContain("URL:")
    expect(ics).not.toContain("DESCRIPTION:")
  })

  test("a cancellation carries no join link", () => {
    const ics = buildCalendarInvite({
      ...base,
      sequence: 1,
      method: "CANCEL",
      joinUrl: null,
    })
    expect(ics).toContain("METHOD:CANCEL")
    expect(ics).not.toContain("URL:")
  })
})
