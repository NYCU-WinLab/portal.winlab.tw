import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"

import { POST } from "./route"

const SECRET = "test-ingest-only-secret-32-characters"
const event = {
  event_id: "a".repeat(64),
  card_id: "0000000042",
  device_time: "2026-09-22T12:30:15+08:00",
  event_code: "0000",
  reader: 1,
  received_at: "2026-09-22T04:43:30Z",
}
const keys = [
  "HAMS_EVENTS_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let calls: { url: string; body: unknown; prefer: string | null }[]
let databaseFails = false

const restorers: (() => void)[] = []

beforeEach(() => {
  calls = []
  databaseFails = false
  process.env.HAMS_EVENTS_SECRET = SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example"
  process.env.SUPABASE_SECRET_KEY = "test-server-only-key"
  const fetchSpy = spyOn(globalThis, "fetch")
  const warnSpy = spyOn(console, "warn")
  const errorSpy = spyOn(console, "error")
  restorers.push(
    () => fetchSpy.mockRestore(),
    () => warnSpy.mockRestore(),
    () => errorSpy.mockRestore()
  )
  warnSpy.mockImplementation(() => {})
  errorSpy.mockImplementation(() => {})
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({
      url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      prefer: headers.get("prefer"),
    })
    if (url.includes("/door_cards")) {
      return new Response(
        JSON.stringify([
          {
            card_id: event.card_id,
            holder_name: "Guest",
            holder_user_id: null,
            updated_at: "2026-09-21T00:00:00Z",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }
    if (databaseFails) {
      return new Response(
        JSON.stringify({ code: "XX000", message: "test failure" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }
    return new Response(null, { status: 201 })
  }
  fetchSpy.mockImplementation(Object.assign(respond, { preconnect: () => {} }))
})

afterEach(() => {
  for (const restore of restorers) restore()
  restorers.length = 0
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function request(body: unknown, authorization = `Bearer ${SECRET}`) {
  return new Request("https://portal.example/api/door/events", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

test("missing configuration and bad authorization never reach the database", async () => {
  delete process.env.HAMS_EVENTS_SECRET
  expect((await POST(request({ events: [event] }))).status).toBe(503)
  process.env.HAMS_EVENTS_SECRET = SECRET
  expect(
    (await POST(request({ events: [event] }, "Bearer wrong"))).status
  ).toBe(401)
  expect(calls).toHaveLength(0)
})

test("invalid bodies are rejected before privileged database access", async () => {
  const response = await POST(
    request({ events: [{ ...event, card_id: "42" }] })
  )
  expect(response.status).toBe(400)
  expect(calls).toHaveLength(0)
})

test("delivery and replay use an idempotent insert and acknowledge only after commit", async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await POST(request({ events: [event] }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accepted: [event.event_id] })
  }
  const writes = calls.filter((call) => call.url.includes("/door_events"))
  expect(writes).toHaveLength(2)
  expect(writes[0]?.url).toContain("on_conflict=source_event_id")
  expect(writes[0]?.prefer).toContain("resolution=ignore-duplicates")
  expect(writes[0]?.body).toMatchObject([
    {
      source: "card",
      source_event_id: event.event_id,
      card_id: event.card_id,
      user_name: "Guest",
      user_id: null,
    },
  ])
})

test("a database failure never returns a delivery receipt", async () => {
  databaseFails = true
  const response = await POST(request({ events: [event] }))
  expect(response.status).toBe(503)
  expect(await response.json()).not.toHaveProperty("accepted")
})
