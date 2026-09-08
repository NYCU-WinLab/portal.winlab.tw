// Server-only write client for the CS dept. meeting-room system, using the
// lab's shared service account (env: MEETINGROOM_SERVICE_USER /
// MEETINGROOM_SERVICE_PASSWORD — never exposed to the client). Unlike
// client.ts (fully anonymous reads), every call here needs a fresh login:
// the session is a plain CodeIgniter cookie (login/auth -> ci_session), not
// something safe to cache across serverless invocations, so this logs in
// once per action rather than holding a session server-side.
//
// Reverse-engineered from the same shipped JS as client.ts
// (public/js/reservation.js). Two things worth flagging for whoever touches
// this next:
// - The booking form's "free" field is NOT the room's price tier — it's an
//   unrelated "open for others to register" checkbox (a dhtmlxScheduler
//   custom field that serializes to "registrable" or ""). We always leave
//   it unset since Portal doesn't expose that option.
// - This file has never been exercised against the real login — there's no
//   way to test it without the real credential. Treat the first real call
//   after any change here as a live test, not a known-good path.

const BASE = "https://www.cs.nycu.edu.tw/csauto/meetingroom"

async function loginServiceAccount(): Promise<string> {
  const userId = process.env.MEETINGROOM_SERVICE_USER
  const password = process.env.MEETINGROOM_SERVICE_PASSWORD
  if (!userId || !password) {
    throw new Error(
      "MEETINGROOM_SERVICE_USER / MEETINGROOM_SERVICE_PASSWORD are not configured"
    )
  }

  const res = await fetch(`${BASE}/login/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ user_id: userId, password }).toString(),
    redirect: "manual",
  })

  const headers = res.headers as Headers & { getSetCookie?: () => string[] }
  const rawCookies =
    headers.getSetCookie?.() ??
    [headers.get("set-cookie")].filter((v): v is string => v !== null)

  const sessionCookie = rawCookies
    .map((c) => c.split(";")[0])
    .find((c) => c?.startsWith("ci_session="))

  if (!sessionCookie) {
    throw new Error("meetingroom login failed — no session cookie returned")
  }

  return sessionCookie
}

export interface ReservationDetails {
  room: string
  /** ISO 8601 timestamp. */
  start: string
  /** ISO 8601 timestamp. */
  end: string
  /** The account this books under — the shared lab account's user_id. */
  subscriber: string
}

/** Books a room; returns the external system's reservation id. */
export async function bookRoom(details: ReservationDetails): Promise<string> {
  const cookie = await loginServiceAccount()

  const res = await fetch(`${BASE}/reservation/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      type: "short",
      start: details.start,
      end: details.end,
      subscriber: details.subscriber,
      room: details.room,
      comment: "",
      free: "",
    }),
  })

  if (!res.ok) {
    throw new Error(
      `meetingroom reservation/add failed: ${res.status}${await reason(res)}`
    )
  }

  const data = (await res.json()) as { id?: string }
  if (!data.id) {
    throw new Error("meetingroom reservation/add returned no id")
  }
  return data.id
}

/**
 * Cancels a booking. The real client always POSTs the full reservation body
 * (not just the id) for add/update/delete alike, so this mirrors that shape
 * rather than trusting delete to work off `id` alone.
 */
export async function cancelRoomBooking(
  externalReservationId: string,
  details: ReservationDetails
): Promise<void> {
  const cookie = await loginServiceAccount()

  const res = await fetch(`${BASE}/reservation/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      id: externalReservationId,
      type: "short",
      start: details.start,
      end: details.end,
      subscriber: details.subscriber,
      room: details.room,
      comment: "",
      free: "",
    }),
  })

  if (!res.ok) {
    throw new Error(
      `meetingroom reservation/delete failed: ${res.status}${await reason(res)}`
    )
  }
}

/**
 * The rejection message the dept system actually sent.
 *
 * Their own AngularJS client renders this body straight into a toast — it's
 * the only place the real reason exists. Recording just the status code threw
 * that away, which is how a 406 on a demonstrably free room became
 * undiagnosable.
 */
async function reason(res: Response): Promise<string> {
  try {
    const body = (await res.text()).trim()
    if (!body) return ""
    // Their errors are short strings; a full HTML error page is noise.
    return ` — ${body.slice(0, 300)}`
  } catch {
    return ""
  }
}
