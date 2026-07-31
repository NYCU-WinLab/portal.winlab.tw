import { describe, expect, test } from "bun:test"

import { recipients } from "./invite-mail"

function input(
  organizerEmail: string,
  attendeeEmails: string[]
): Parameters<typeof recipients>[0] {
  return {
    bookingId: "b1",
    title: "[tasa]-meeting",
    room: "600A",
    date: "2026-08-04",
    startTime: "09:30",
    endTime: "10:00",
    start: "2026-08-04T01:30:00.000Z",
    end: "2026-08-04T02:00:00.000Z",
    organizer: { name: "N0Ball", email: organizerEmail },
    attendees: attendeeEmails.map((email) => ({ name: email, email })),
    sequence: 0,
  }
}

describe("recipients", () => {
  // The one that bit: someone booked a meeting they weren't personally
  // attending, so the invite went to the attendees and the organiser got
  // nothing — no mail, and no copy of the meeting in their own calendar.
  test("includes the organiser even when they aren't an attendee", () => {
    expect(recipients(input("me@winlab.tw", ["a@winlab.tw"]))).toEqual([
      "me@winlab.tw",
      "a@winlab.tw",
    ])
  })

  test("doesn't mail the organiser twice when they're also an attendee", () => {
    expect(
      recipients(input("me@winlab.tw", ["me@winlab.tw", "a@winlab.tw"]))
    ).toEqual(["me@winlab.tw", "a@winlab.tw"])
  })

  test("de-duplicates regardless of case", () => {
    expect(recipients(input("Me@WinLab.tw", ["me@winlab.tw"]))).toEqual([
      "Me@WinLab.tw",
    ])
  })

  test("a meeting with no attendees still reaches the organiser", () => {
    expect(recipients(input("me@winlab.tw", []))).toEqual(["me@winlab.tw"])
  })

  test("skips an organiser with no address on record", () => {
    expect(recipients(input("", ["a@winlab.tw"]))).toEqual(["a@winlab.tw"])
  })

  test("is empty when there is nobody to reach", () => {
    expect(recipients(input("", []))).toEqual([])
  })
})
