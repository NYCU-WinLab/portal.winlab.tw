import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test"

import { renderNameBitmap } from "@/lib/door/display"

// after() only works inside a Next request scope; collect the callbacks so a
// test can run them once the response is in hand, like Next does.
let deferred: (() => unknown)[] = []
const nextServer = await import("next/server")
mock.module("next/server", () => ({
  ...nextServer,
  after: (task: () => unknown) => {
    deferred.push(task)
  },
}))
const { POST } = await import("./route")

async function runDeferred() {
  const tasks = deferred
  deferred = []
  for (const task of tasks) await task()
}

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
  "DISPLAY_API_URL",
  "DISPLAY_API_SECRET",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let calls: {
  url: string
  body: unknown
  prefer: string | null
  raw?: Uint8Array
}[]
let databaseFails = false
type Holder = {
  card_id: string
  holder_name: string
  holder_user_id: string | null
  updated_at: string
}
const guest: Holder = {
  card_id: event.card_id,
  holder_name: "Guest",
  holder_user_id: null,
  updated_at: "2026-09-21T00:00:00Z",
}
let holders: Holder[]
// null keeps the old empty 201 body; a list is what PostgREST returns for the
// rows the upsert actually inserted.
let insertedIds: string[] | null
let profileName: string | null
let panelFails: boolean

const restorers: (() => void)[] = []

beforeEach(() => {
  calls = []
  deferred = []
  databaseFails = false
  holders = [guest]
  insertedIds = null
  profileName = null
  panelFails = false
  delete process.env.DISPLAY_API_URL
  delete process.env.DISPLAY_API_SECRET
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
      raw: init?.body instanceof Uint8Array ? init.body : undefined,
    })
    if (url.startsWith("http://panel.test/")) {
      if (panelFails) throw new TypeError("fetch failed")
      return new Response(null, { status: 202 })
    }
    if (url.includes("/user_profiles")) {
      return Response.json(profileName === null ? null : { name: profileName })
    }
    if (url.includes("/door_cards")) {
      return new Response(JSON.stringify(holders), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
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
    if (insertedIds === null) return new Response(null, { status: 201 })
    return Response.json(
      insertedIds.map((id) => ({ source_event_id: id })),
      { status: 201 }
    )
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

describe("LED panel greeting for card swipes", () => {
  const member = "99999999-8888-7777-6666-555555555555"
  const swipe = (id: string, deviceTime: string, overrides = {}) => ({
    ...event,
    event_id: id.repeat(64),
    device_time: deviceTime,
    ...overrides,
  })
  const first = swipe("1", "2026-09-22T12:30:15+08:00")
  const second = swipe("2", "2026-09-22T12:30:20+08:00", {
    card_id: "0000000043",
  })

  beforeEach(() => {
    process.env.DISPLAY_API_URL = "http://panel.test"
    process.env.DISPLAY_API_SECRET = "panel-secret"
  })

  async function deliver(events: object[]) {
    const response = await POST(request({ events }))
    const body = await response.json()
    await runDeferred()
    return { response, body }
  }
  const shown = () =>
    calls
      .filter((call) => call.url.startsWith("http://panel.test/"))
      .map((call) => Array.from(call.raw ?? []))
  const bitmapOf = (label: string) => Array.from(renderNameBitmap(label))

  test("asks the upsert for the rows it actually inserted", async () => {
    insertedIds = []
    await deliver([first])
    const write = calls.find((call) => call.url.includes("/door_events"))
    expect(write?.url).toContain("select=source_event_id")
    expect(write?.prefer).toContain("resolution=ignore-duplicates")
    expect(write?.prefer).toContain("return=representation")
  })

  test("a fresh granted swipe by an attributed holder is greeted", async () => {
    holders = [{ ...guest, holder_name: "Simon Chu" }]
    insertedIds = [first.event_id]
    const { response, body } = await deliver([first])
    expect(response.status).toBe(200)
    expect(body).toEqual({ accepted: [first.event_id] })
    expect(shown()).toEqual([bitmapOf("Simon")])
  })

  test("a duplicate already in door_events greets nobody", async () => {
    insertedIds = []
    const { body } = await deliver([first])
    expect(body).toEqual({ accepted: [first.event_id] })
    expect(shown()).toEqual([])
  })

  test("denied and unattributed swipes greet nobody", async () => {
    insertedIds = [first.event_id]
    await deliver([{ ...first, event_code: "0015" }])
    holders = []
    await deliver([first])
    // Assigned after the swipe: history is not attributed to the new holder.
    holders = [{ ...guest, updated_at: "2026-09-23T00:00:00Z" }]
    await deliver([first])
    expect(shown()).toEqual([])
  })

  test("a batch of 3 is backfill and greets nobody", async () => {
    const third = swipe("3", "2026-09-22T12:30:25+08:00")
    holders = [guest, { ...guest, card_id: second.card_id }]
    insertedIds = [first.event_id, second.event_id, third.event_id]
    const { body } = await deliver([first, second, third])
    expect(body.accepted).toHaveLength(3)
    expect(shown()).toEqual([])
  })

  test("a batch of 2 greets only the newest swipe", async () => {
    holders = [
      { ...guest, holder_name: "Older" },
      { ...guest, card_id: second.card_id, holder_name: "Newer" },
    ]
    insertedIds = [first.event_id, second.event_id]
    await deliver([second, first])
    expect(shown()).toEqual([bitmapOf("Newer")])
  })

  test("a holder_user_id prefers the member's profile name", async () => {
    holders = [{ ...guest, holder_name: "詠翔 詹", holder_user_id: member }]
    insertedIds = [first.event_id]
    profileName = "郭愷"
    await deliver([first])
    const lookup = calls.find((call) => call.url.includes("/user_profiles"))
    expect(lookup?.url).toContain(`id=eq.${member}`)
    expect(shown()).toEqual([bitmapOf("郭愷")])
  })

  test("without a profile name the holder_name is used", async () => {
    holders = [{ ...guest, holder_name: "詠翔 詹", holder_user_id: member }]
    insertedIds = [first.event_id]
    profileName = null
    await deliver([first])
    expect(shown()).toEqual([bitmapOf("詹詠翔")])
  })

  test("a failing panel never changes the receipt", async () => {
    holders = [{ ...guest, holder_name: "Simon Chu" }]
    insertedIds = [first.event_id]
    panelFails = true
    const { response, body } = await deliver([first])
    expect(response.status).toBe(200)
    expect(body).toEqual({ accepted: [first.event_id] })
    expect(
      calls.some((call) => call.url.startsWith("http://panel.test/"))
    ).toBe(true)
  })
})
