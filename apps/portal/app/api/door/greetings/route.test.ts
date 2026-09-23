import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"

import { GET } from "./route"

const SECRET = "test-display-secret-32-characters!!"
const keys = [
  "DISPLAY_API_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let calls: { url: string; method: string; apikey: string | null }[]
let profilesFail = false
const restorers: (() => void)[] = []

const PROFILES = [
  {
    id: "u1",
    name: "詠翔 詹",
    door_greeting_suffix: "好帥",
    door_greeting_color: "#ff4040",
  },
  {
    id: "u2",
    name: "  Simon  ",
    door_greeting_suffix: "hi!",
    door_greeting_color: null,
  },
  {
    id: "u3",
    name: "Carol",
    door_greeting_suffix: null,
    door_greeting_color: "#33e6ff",
  },
]
const CARDS = [
  { holder_name: "Loki  Zhan", holder_user_id: "u1" },
  { holder_name: "詹詠翔", holder_user_id: "u1" },
  { holder_name: "Carol  Wu", holder_user_id: "u3" },
]

beforeEach(() => {
  calls = []
  profilesFail = false
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
    const url = String(input)
    calls.push({
      url,
      method: init?.method ?? "GET",
      apikey: new Headers(init?.headers).get("apikey"),
    })
    if (url.includes("/user_profiles")) {
      if (profilesFail) {
        return Response.json(
          { code: "XX000", message: "test failure" },
          { status: 500 }
        )
      }
      return Response.json(PROFILES)
    }
    if (url.includes("/door_cards")) return Response.json(CARDS)
    return new Response(null, { status: 404 })
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

const request = (authorization: string | null = `Bearer ${SECRET}`) =>
  new Request("https://portal.example/api/door/greetings", {
    headers: authorization ? { Authorization: authorization } : {},
  })

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

test("200 maps profile names and linked card holder names, normalised", async () => {
  const response = await GET(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({
    suffix: {
      詹詠翔: "好帥",
      "Loki Zhan": "好帥",
      Simon: "hi!",
    },
    color: {
      詹詠翔: "#ff4040",
      "Loki Zhan": "#ff4040",
      Carol: "#33e6ff",
      "Carol Wu": "#33e6ff",
    },
  })
  const profileRead = calls.find((call) => call.url.includes("/user_profiles"))
  expect(profileRead?.method).toBe("GET")
  expect(decodeURIComponent(profileRead?.url ?? "")).toContain(
    "or=(door_greeting_suffix.not.is.null,door_greeting_color.not.is.null)"
  )
  expect(decodeURIComponent(profileRead?.url ?? "")).toContain(
    "select=id,name,door_greeting_suffix,door_greeting_color"
  )
  expect(profileRead?.apikey).toBe("test-server-only-key")
  const cardRead = calls.find((call) => call.url.includes("/door_cards"))
  expect(cardRead?.method).toBe("GET")
  expect(decodeURIComponent(cardRead?.url ?? "")).toContain(
    "holder_user_id=in.(u1,u2,u3)"
  )
  expect(calls.every((call) => call.method === "GET")).toBe(true)
})

test("a database failure is a 503, not an empty map", async () => {
  profilesFail = true
  const response = await GET(request())
  expect(response.status).toBe(503)
  const body = await response.json()
  expect(body).not.toHaveProperty("suffix")
  expect(body).not.toHaveProperty("color")
})
