// Builds the iCalendar payload attached to booking invite mail.
//
// Why an .ics attachment rather than the Google Calendar API: with
// METHOD:REQUEST, Gmail (and Outlook, and Apple Mail) renders the message as
// a real invite with Yes/Maybe/No buttons, and accepting drops it straight
// into the recipient's own calendar. That's the whole ask, and it needs no
// OAuth, no per-user Google authorisation, and no stored Google credential.
//
// One caveat worth knowing: RSVP responses are emailed back to the ORGANIZER
// address. We set that to the person who made the booking (a real mailbox),
// so replies land somewhere a human reads — Portal itself does not track
// who accepted.

export interface CalendarEvent {
  /** Stable per booking — a CANCEL must reuse the REQUEST's uid. */
  uid: string
  title: string
  room: string
  /** ISO 8601 instant. */
  start: string
  /** ISO 8601 instant. */
  end: string
  organizer: { name: string; email: string }
  attendees: { name: string; email: string }[]
  /** Bumped on each update so clients accept the newer version. */
  sequence: number
  method: "REQUEST" | "CANCEL"
}

/** `2026-08-01T02:00:00.000Z` -> `20260801T020000Z` */
function toIcsUtc(iso: string): string {
  return `${iso
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
    .replace(/Z$/, "")}Z`
}

// RFC 5545 §3.3.11: escape backslash, semicolon, comma, and newline in TEXT.
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

// RFC 5545 §3.1: lines are folded at 75 octets, continuations start with a
// space. Folding on octets rather than characters matters here — the titles
// are usually Chinese, so one character is 3 bytes.
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8")
  if (bytes.length <= 75) return line

  const chunks: string[] = []
  let start = 0
  let limit = 75
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length)
    // Don't split a multi-byte character: continuation bytes are 10xxxxxx.
    while (end > start && end < bytes.length && (bytes[end]! & 0xc0) === 0x80) {
      end--
    }
    chunks.push(bytes.subarray(start, end).toString("utf8"))
    start = end
    limit = 74 // continuation lines lose one octet to the leading space
  }
  return chunks.join("\r\n ")
}

export function buildCalendarInvite(event: CalendarEvent): string {
  const stamp = toIcsUtc(new Date(event.start).toISOString())

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WinLab//portal.winlab.tw//ZH-TW",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.method}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `LOCATION:${escapeText(`資工系 ${event.room}`)}`,
    `ORGANIZER;CN=${escapeText(event.organizer.name)}:mailto:${event.organizer.email}`,
    ...event.attendees.map(
      (a) =>
        `ATTENDEE;CN=${escapeText(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`
    ),
    `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]

  return lines.map(foldLine).join("\r\n")
}
