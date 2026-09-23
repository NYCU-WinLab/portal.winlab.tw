import {
  afterEach,
  beforeEach,
  expect,
  setSystemTime,
  spyOn,
  test,
} from "bun:test"

import type { DoorMeeting } from "@/lib/door/meeting"

import { GET } from "./route"

const SECRET = "test-display-secret-32-characters!!"
const keys = [
  "DISPLAY_API_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
const restorers: (() => void)[] = []

type Row = Record<string, unknown>
let calls: {
  url: string
  method: string
  apikey: string | null
  signal: boolean
}[]
let failTable: string | null

function meeting(date: string, fields: Row = {}): Row {
  return {
    id: `m-${date}`,
    week_label: null,
    scheduled_date: date,
    is_holiday: false,
    is_speaker: false,
    is_thesis: false,
    presenter: null,
    presenter_user_id: null,
    ppt_uploaded: false,
    ppt_link: "https://example.test/ppt",
    video_uploaded: false,
    video_link: null,
    paper_title: "A paper",
    paper_link: "https://example.test/paper",
    teacher_paper_id: null,
    notes: null,
    location: "EC 411",
    start_time: "15:30",
    created_at: "2026-08-01T00:00:00Z",
    ...fields,
  }
}

// Shaped like production: Keycloak "given family" names in user_profiles,
// a stale snapshot in meetings.presenter, and a holiday row between weeks.
const PROFILES: Row[] = [
  { id: "u-liu", name: "哲佑 劉", email: "liu@example.test" },
  { id: "u-lai", name: "羿茗 賴", email: "lai@example.test" },
  { id: "u-tsao", name: "曹琇雅", email: "tsao@example.test" },
  { id: "u-chan", name: "詠翔 詹", email: "chan@example.test" },
  { id: "u-wu", name: "  Carol   Wu ", email: "wu@example.test" },
  { id: "u-noname", name: null, email: "noname@example.test" },
]
const BASE_MEETINGS: Row[] = [
  meeting("2026-09-28", { presenter: "詹詠翔", presenter_user_id: "u-chan" }),
  meeting("2026-10-05", {
    presenter: "劉 哲佑",
    presenter_user_id: "u-liu",
  }),
  meeting("2026-10-12", { is_holiday: true, week_label: "期中考" }),
  meeting("2026-10-19", {
    presenter: "琇雅 曹",
    presenter_user_id: "u-missing",
  }),
]
const BASE_QUESTIONERS: Row[] = [
  { meeting_id: "m-2026-10-05", user_id: "u-lai", assigned_at: "2026-09-01" },
  { meeting_id: "m-2026-10-05", user_id: "u-tsao", assigned_at: "2026-09-02" },
  { meeting_id: "m-2026-10-19", user_id: "u-chan", assigned_at: "2026-09-03" },
]
const BASE_LEAVES: Row[] = [
  { user_id: "u-wu", date: "2026-10-05", created_at: "2026-09-20T02:00:00Z" },
  { user_id: "u-chan", date: "2026-10-05", created_at: "2026-09-20T01:00:00Z" },
  {
    user_id: "u-noname",
    date: "2026-10-05",
    created_at: "2026-09-21T01:00:00Z",
  },
  { user_id: "u-lai", date: "2026-10-19", created_at: "2026-09-20T01:00:00Z" },
  { user_id: "u-tsao", date: "2026-09-28", created_at: "2026-09-20T01:00:00Z" },
]
let meetings: Row[]
let leaves: Row[]

const lookup = (row: Row, path: string): unknown =>
  path
    .split(".")
    .reduce<unknown>((value, key) => (value as Row | null)?.[key], row)

// Just enough PostgREST to answer the queries the route and the shared
// meeting builders send: eq / gte / lte / in filters (embedded ones too),
// order and limit.
function query(rows: Row[], params: URLSearchParams): Row[] {
  let result = [...rows]
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue
    const dot = raw.indexOf(".")
    const op = raw.slice(0, dot)
    const value = raw.slice(dot + 1)
    result = result.filter((row) => {
      const actual = String(lookup(row, key))
      if (op === "eq") return actual === value
      if (op === "gte") return actual >= value
      if (op === "lte") return actual <= value
      if (op === "in") {
        return value
          .slice(1, -1)
          .split(",")
          .map((item) => item.replace(/^"|"$/g, ""))
          .includes(actual)
      }
      throw new Error(`fake PostgREST does not know ${op}`)
    })
  }
  const order = params.get("order")
  if (order) {
    const [column, direction] = order.split(",")[0]!.split(".")
    result.sort((a, b) => {
      const cmp = String(a[column!]).localeCompare(String(b[column!]))
      return direction === "desc" ? -cmp : cmp
    })
  }
  const limit = params.get("limit")
  return limit ? result.slice(0, Number(limit)) : result
}

function table(name: string): Row[] {
  if (name === "meetings") return meetings
  if (name === "leaves") return leaves
  if (name === "user_profiles") return PROFILES
  if (name === "meeting_questioners") {
    return BASE_QUESTIONERS.map((q) => ({
      ...q,
      source: "auto",
      user_profiles: {
        name: PROFILES.find((p) => p.id === q.user_id)?.name ?? null,
      },
      meetings: {
        scheduled_date: meetings.find((m) => m.id === q.meeting_id)
          ?.scheduled_date,
      },
    }))
  }
  throw new Error(`fake PostgREST has no table ${name}`)
}

beforeEach(() => {
  calls = []
  failTable = null
  meetings = BASE_MEETINGS
  leaves = BASE_LEAVES
  setSystemTime(new Date("2026-09-30T02:00:00Z"))
  process.env.DISPLAY_API_SECRET = SECRET
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database.example"
  process.env.SUPABASE_SECRET_KEY = "test-server-only-key"
  const fetchSpy = spyOn(globalThis, "fetch")
  const warnSpy = spyOn(console, "warn").mockImplementation(() => {})
  const errorSpy = spyOn(console, "error").mockImplementation(() => {})
  restorers.push(
    () => fetchSpy.mockRestore(),
    () => warnSpy.mockRestore(),
    () => errorSpy.mockRestore()
  )
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = new URL(String(input))
    calls.push({
      url: decodeURIComponent(url.toString()),
      method: init?.method ?? "GET",
      apikey: new Headers(init?.headers).get("apikey"),
      signal: init?.signal instanceof AbortSignal,
    })
    const name = url.pathname.replace("/rest/v1/", "")
    if (name === failTable) {
      return Response.json(
        { code: "XX000", message: "test failure" },
        { status: 500 }
      )
    }
    return Response.json(query(table(name), url.searchParams))
  }
  fetchSpy.mockImplementation(Object.assign(respond, { preconnect: () => {} }))
})

afterEach(() => {
  setSystemTime()
  for (const restore of restorers) restore()
  restorers.length = 0
  for (const key of keys) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const request = (authorization: string | null = `Bearer ${SECRET}`) =>
  new Request("https://portal.example/api/door/meeting", {
    headers: authorization ? { Authorization: authorization } : {},
  })

async function read(at?: string) {
  if (at) setSystemTime(new Date(at))
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  return (await response.json()) as { meeting: DoorMeeting | null }
}

test("503 when the secret is unset or shorter than 32 characters", async () => {
  delete process.env.DISPLAY_API_SECRET
  expect((await GET(request())).status).toBe(503)
  process.env.DISPLAY_API_SECRET = "too-short"
  expect((await GET(request("Bearer too-short"))).status).toBe(503)
  expect(calls).toHaveLength(0)
})

test("401 on a missing or wrong bearer, before any database read", async () => {
  expect((await GET(request(null))).status).toBe(401)
  expect((await GET(request("Bearer nope"))).status).toBe(401)
  expect((await GET(request(`Bearer ${SECRET}x`))).status).toBe(401)
  expect(calls).toHaveLength(0)
})

test("200 returns the next meeting with display names and nothing else", async () => {
  const body = await read()
  expect(body).toEqual({
    meeting: {
      starts_at: "2026-10-05T15:30:00+08:00",
      location: "EC 411",
      type_label: "報告",
      presenter: "劉哲佑",
      questioners: ["賴羿茗", "曹琇雅"],
      absent: ["詹詠翔", "Carol Wu"],
    },
  })
  const text = JSON.stringify(body)
  expect(text).not.toContain("@")
  expect(text).not.toContain("u-")
  expect(text).not.toContain("http")
  expect(calls.every((call) => call.method === "GET")).toBe(true)
  expect(calls.every((call) => call.apikey === "test-server-only-key")).toBe(
    true
  )
  // The 5 second budget reaches the shared meeting builders too.
  expect(calls.every((call) => call.signal)).toBe(true)
  expect(calls.find((call) => call.url.includes("/leaves"))?.url).toContain(
    "date=eq.2026-10-05"
  )
})

test("null when nothing is scheduled from today on", async () => {
  expect(await read("2026-12-01T02:00:00Z")).toEqual({ meeting: null })
  meetings = []
  expect(await read()).toEqual({ meeting: null })
})

test("holiday weeks are skipped, and a schedule of only holidays is null", async () => {
  const body = await read("2026-10-06T02:00:00Z")
  expect(body.meeting?.starts_at).toBe("2026-10-19T15:30:00+08:00")
  meetings = [meeting("2026-10-12", { is_holiday: true })]
  expect(await read()).toEqual({ meeting: null })
})

test("presenter falls back to the row snapshot, normalised", async () => {
  const body = await read("2026-10-06T02:00:00Z")
  expect(body.meeting).toMatchObject({
    presenter: "曹琇雅",
    questioners: ["詹詠翔"],
    absent: ["賴羿茗"],
  })
  meetings = [meeting("2026-10-05", { presenter: "  Tim  " })]
  expect((await read("2026-10-01T02:00:00Z")).meeting?.presenter).toBe("Tim")
})

test("absent lists only sign-ups for that meeting's date", async () => {
  leaves = BASE_LEAVES.filter((leave) => leave.date !== "2026-10-05")
  expect((await read()).meeting?.absent).toEqual([])
})

test("today is the Taipei day, around Taipei midnight", async () => {
  // 00:30 Monday in Taipei, still Sunday in UTC.
  expect((await read("2026-10-04T16:30:00Z")).meeting?.starts_at).toBe(
    "2026-10-05T15:30:00+08:00"
  )
  // 23:30 Monday in Taipei: the meeting is over but today still counts.
  expect((await read("2026-10-05T15:30:00Z")).meeting?.starts_at).toBe(
    "2026-10-05T15:30:00+08:00"
  )
  // 00:30 Tuesday in Taipei, still Monday in UTC: Monday is yesterday.
  expect((await read("2026-10-05T16:30:00Z")).meeting?.starts_at).toBe(
    "2026-10-19T15:30:00+08:00"
  )
  expect(
    calls.some((call) => call.url.includes("scheduled_date=gte.2026-10-06"))
  ).toBe(true)
})

test("a database failure is a 503, not a null meeting", async () => {
  for (const name of ["meetings", "leaves", "user_profiles"]) {
    failTable = name
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty("meeting")
  }
})
