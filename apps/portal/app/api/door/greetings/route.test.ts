import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"

import { GET } from "./route"

const SECRET = "test-display-secret-32-characters!!"
const keys = [
  "DISPLAY_API_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
] as const
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
let calls: {
  url: string
  method: string
  apikey: string | null
  body: string | null
}[]
let profilesFail = false
let signFail = false
const restorers: (() => void)[] = []

const PROFILES = [
  {
    id: "u1",
    name: "詠翔 詹",
    door_greeting_suffix: "好帥",
    door_greeting_color: "#ff4040",
    door_sound_path: "u1/20260923120000-abcd1234.mp3",
    door_sound_mode: "sound_then_voice",
  },
  {
    id: "u2",
    name: "  Simon  ",
    door_greeting_suffix: "hi!",
    door_greeting_color: null,
    door_sound_path: null,
    door_sound_mode: "voice_only",
  },
  {
    id: "u3",
    name: "Carol",
    door_greeting_suffix: null,
    door_greeting_color: "#33e6ff",
    door_sound_path: "u3/20260923120000-ffff0000.ogg",
    door_sound_mode: "sound_only",
  },
  {
    id: "u4",
    name: "Dana",
    door_greeting_suffix: null,
    door_greeting_color: null,
    door_sound_path: "u4/20260923120000-00000000.wav",
    door_sound_mode: "voice_only",
  },
  {
    id: "u5",
    name: "Eve",
    door_greeting_suffix: null,
    door_greeting_color: null,
    door_sound_path: "u1/20260923120000-abcd1234.mp3",
    door_sound_mode: "sound_only",
  },
  {
    id: "u6",
    name: "Finn",
    door_greeting_suffix: null,
    door_greeting_color: null,
    door_sound_path: "u6/20260923120000-deadbeef.m4a",
    door_sound_mode: "sound_only",
  },
]
const MISSING_OBJECT = "u6/20260923120000-deadbeef.m4a"
const CARDS = [
  { holder_name: "Loki  Zhan", holder_user_id: "u1" },
  { holder_name: "詹詠翔", holder_user_id: "u1" },
  { holder_name: "Carol  Wu", holder_user_id: "u3" },
]

beforeEach(() => {
  calls = []
  profilesFail = false
  signFail = false
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
      body: typeof init?.body === "string" ? init.body : null,
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
    if (url.includes("/storage/v1/object/sign/door-sounds")) {
      if (signFail) {
        return Response.json(
          { statusCode: "500", error: "boom", message: "test failure" },
          { status: 500 }
        )
      }
      const { paths } = JSON.parse(String(init?.body)) as { paths: string[] }
      return Response.json(
        paths.map((path) =>
          path === MISSING_OBJECT
            ? { path, signedURL: null, error: "Object not found" }
            : {
                path,
                signedURL: `/object/sign/door-sounds/${path}?token=t-${path.slice(0, 2)}`,
                error: null,
              }
        )
      )
    }
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
    sound: {
      詹詠翔: {
        url: "https://database.example/storage/v1/object/sign/door-sounds/u1/20260923120000-abcd1234.mp3?token=t-u1",
        mode: "sound_then_voice",
        version: "u1/20260923120000-abcd1234.mp3",
      },
      "Loki Zhan": {
        url: "https://database.example/storage/v1/object/sign/door-sounds/u1/20260923120000-abcd1234.mp3?token=t-u1",
        mode: "sound_then_voice",
        version: "u1/20260923120000-abcd1234.mp3",
      },
      Carol: {
        url: "https://database.example/storage/v1/object/sign/door-sounds/u3/20260923120000-ffff0000.ogg?token=t-u3",
        mode: "sound_only",
        version: "u3/20260923120000-ffff0000.ogg",
      },
      "Carol Wu": {
        url: "https://database.example/storage/v1/object/sign/door-sounds/u3/20260923120000-ffff0000.ogg?token=t-u3",
        mode: "sound_only",
        version: "u3/20260923120000-ffff0000.ogg",
      },
    },
  })
  const profileRead = calls.find((call) => call.url.includes("/user_profiles"))
  expect(profileRead?.method).toBe("GET")
  expect(decodeURIComponent(profileRead?.url ?? "")).toContain(
    "or=(door_greeting_suffix.not.is.null,door_greeting_color.not.is.null,door_sound_path.not.is.null)"
  )
  expect(decodeURIComponent(profileRead?.url ?? "")).toContain(
    "select=id,name,door_greeting_suffix,door_greeting_color,door_sound_path,door_sound_mode"
  )
  expect(profileRead?.apikey).toBe("test-server-only-key")
  const cardRead = calls.find((call) => call.url.includes("/door_cards"))
  expect(cardRead?.method).toBe("GET")
  expect(decodeURIComponent(cardRead?.url ?? "")).toContain(
    "holder_user_id=in.(u1,u2,u3,u4,u5,u6)"
  )
  // Only playable sounds in the member's own folder are signed: not Dana's
  // (voice_only), not Eve's (a path in someone else's folder).
  const signs = calls.filter((call) => call.url.includes("/storage/"))
  expect(signs).toHaveLength(1)
  expect(signs[0]?.method).toBe("POST")
  expect(signs[0]?.apikey).toBe("test-server-only-key")
  expect(JSON.parse(signs[0]?.body ?? "{}")).toEqual({
    expiresIn: 3600,
    paths: [
      "u1/20260923120000-abcd1234.mp3",
      "u3/20260923120000-ffff0000.ogg",
      "u6/20260923120000-deadbeef.m4a",
    ],
  })
  expect(
    calls
      .filter((call) => !call.url.includes("/storage/"))
      .every((call) => call.method === "GET")
  ).toBe(true)
})

test("no storage call when nobody has a playable sound", async () => {
  const saved = PROFILES.map((p) => ({ ...p }))
  for (const profile of PROFILES) profile.door_sound_mode = "voice_only"
  try {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect((await response.json()).sound).toEqual({})
    expect(calls.some((call) => call.url.includes("/storage/"))).toBe(false)
  } finally {
    PROFILES.splice(0, PROFILES.length, ...saved)
  }
})

test("a failed signing call is a 503, not an empty sound map", async () => {
  signFail = true
  const response = await GET(request())
  expect(response.status).toBe(503)
  expect(await response.json()).not.toHaveProperty("sound")
})

test("a database failure is a 503, not an empty map", async () => {
  profilesFail = true
  const response = await GET(request())
  expect(response.status).toBe(503)
  const body = await response.json()
  expect(body).not.toHaveProperty("suffix")
  expect(body).not.toHaveProperty("color")
})
