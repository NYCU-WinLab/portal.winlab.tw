import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createClient } from "@supabase/supabase-js"

import { DOOR_SOUND_MAX_BYTES } from "@/lib/door/sound"
import {
  clearDoorSound,
  fetchDoorSound,
  removeStaleDoorSounds,
  SAVE_SOUND_FAILED,
  signOwnDoorSound,
  SOUND_MODE_INVALID,
  SOUND_MODE_NEEDS_FILE,
  SOUND_UPLOAD_MISSING,
  SOUND_UPLOAD_REJECTED,
  updateDoorSound,
} from "@/lib/profile/door-sound"

const USER = "51111111-1111-1111-1111-111111111111"
const OTHER = "52222222-2222-2222-2222-222222222222"
const OLD = `${USER}/20260901000000-aaaaaaaa.mp3`
const NEW = `${USER}/20260923120000-bbbbbbbb.m4a`

type Call = { url: string; method: string; body: unknown; apikey: string }
let calls: Call[]
let row: { door_sound_path: string | null; door_sound_mode: string } | null
let info: Record<string, unknown> | null
let patchOk: boolean
let listing: { name: string; id: string | null; created_at: string }[]
const restorers: (() => void)[] = []

beforeEach(() => {
  calls = []
  row = { door_sound_path: OLD, door_sound_mode: "sound_only" }
  info = { name: NEW, size: 1234, content_type: "audio/mp4" }
  patchOk = true
  listing = []
  const fetchSpy = spyOn(globalThis, "fetch")
  const errorSpy = spyOn(console, "error").mockImplementation(() => {})
  restorers.push(
    () => fetchSpy.mockRestore(),
    () => errorSpy.mockRestore()
  )
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = decodeURIComponent(String(input))
    const method = init?.method ?? "GET"
    calls.push({
      url,
      method,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      apikey: new Headers(init?.headers).get("apikey") ?? "",
    })
    if (url.includes("/rest/v1/user_profiles")) {
      if (method === "GET") return Response.json(row)
      return patchOk
        ? Response.json([{ id: USER }])
        : Response.json({ code: "23514", message: "check" }, { status: 400 })
    }
    if (url.includes("/storage/v1/object/info/door-sounds/")) {
      return info
        ? Response.json(info)
        : Response.json(
            {
              statusCode: "404",
              error: "not_found",
              message: "Object not found",
            },
            { status: 400 }
          )
    }
    if (url.includes("/storage/v1/object/list/door-sounds")) {
      return Response.json(listing)
    }
    if (url.includes("/storage/v1/object/sign/door-sounds/")) {
      return Response.json({ signedURL: "/object/sign/door-sounds/x?token=t" })
    }
    if (url.endsWith("/storage/v1/object/door-sounds") && method === "DELETE") {
      return Response.json([])
    }
    return new Response(null, { status: 404 })
  }
  fetchSpy.mockImplementation(Object.assign(respond, { preconnect: () => {} }))
})

afterEach(() => {
  for (const restore of restorers) restore()
  restorers.length = 0
})

const member = () =>
  createClient("https://database.example", "member-jwt", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
const admin = () =>
  createClient("https://database.example", "service-key", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
const deps = () => ({
  supabase: member(),
  admin: admin(),
  userId: USER,
  sleep: async () => {},
})
const removed = () =>
  calls
    .filter((c) => c.method === "DELETE" && c.url.includes("/storage/"))
    .flatMap((c) => (c.body as { prefixes: string[] }).prefixes)
const patches = () =>
  calls.filter((c) => c.method === "PATCH").map((c) => c.body)

describe("fetchDoorSound", () => {
  test("returns the member's path and mode", async () => {
    expect(await fetchDoorSound(member(), USER)).toEqual({
      path: OLD,
      mode: "sound_only",
    })
  })

  test("a path outside the member's folder reads as no sound", async () => {
    row = { door_sound_path: `${OTHER}/x.mp3`, door_sound_mode: "sound_only" }
    expect(await fetchDoorSound(member(), USER)).toEqual({
      path: null,
      mode: "voice_only",
    })
  })
})

describe("updateDoorSound", () => {
  test("checks the new upload, then points the member's row at it", async () => {
    const result = await updateDoorSound(deps(), {
      path: NEW,
      mode: "sound_then_voice",
    })
    expect(result).toEqual({
      ok: true,
      path: NEW,
      mode: "sound_then_voice",
      previous: OLD,
    })
    expect(patches()).toEqual([
      { door_sound_path: NEW, door_sound_mode: "sound_then_voice" },
    ])
    const infoCall = calls.find((c) => c.url.includes("/object/info/"))
    expect(infoCall?.apikey).toBe("service-key")
    const patch = calls.find((c) => c.method === "PATCH")
    expect(patch?.apikey).toBe("member-jwt")
    expect(patch?.url).toContain(`id=eq.${USER}`)
    expect(removed()).toEqual([])
  })

  test("changing only the mode keeps the current file and skips storage", async () => {
    const result = await updateDoorSound(deps(), { mode: "sound_then_voice" })
    expect(result).toMatchObject({ ok: true, path: OLD })
    expect(patches()).toEqual([
      { door_sound_path: OLD, door_sound_mode: "sound_then_voice" },
    ])
    expect(calls.some((c) => c.url.includes("/storage/"))).toBe(false)
  })

  test("a mode that plays a file needs a file", async () => {
    row = { door_sound_path: null, door_sound_mode: "voice_only" }
    expect(await updateDoorSound(deps(), { mode: "sound_only" })).toEqual({
      ok: false,
      error: SOUND_MODE_NEEDS_FILE,
    })
    expect(patches()).toEqual([])
  })

  test("rejects an unknown mode and a path outside the member's folder", async () => {
    expect(await updateDoorSound(deps(), { mode: "loud" })).toEqual({
      ok: false,
      error: SOUND_MODE_INVALID,
    })
    expect(
      await updateDoorSound(deps(), {
        path: `${OTHER}/20260923120000-bbbbbbbb.m4a`,
        mode: "sound_only",
      })
    ).toEqual({ ok: false, error: SOUND_UPLOAD_REJECTED })
    expect(calls).toHaveLength(0)
  })

  test("an oversized or non-audio object is removed and not saved", async () => {
    info = { size: DOOR_SOUND_MAX_BYTES + 1, content_type: "audio/mp4" }
    expect(
      await updateDoorSound(deps(), { path: NEW, mode: "sound_only" })
    ).toEqual({ ok: false, error: SOUND_UPLOAD_REJECTED })
    info = { size: 10, content_type: "image/png" }
    expect(
      await updateDoorSound(deps(), { path: NEW, mode: "sound_only" })
    ).toEqual({ ok: false, error: SOUND_UPLOAD_REJECTED })
    expect(patches()).toEqual([])
    expect(removed()).toEqual([NEW, NEW])
  })

  test("a missing upload is reported after a few tries", async () => {
    info = null
    expect(
      await updateDoorSound(deps(), { path: NEW, mode: "sound_only" })
    ).toEqual({ ok: false, error: SOUND_UPLOAD_MISSING })
    expect(calls.filter((c) => c.url.includes("/object/info/"))).toHaveLength(3)
    expect(patches()).toEqual([])
  })

  test("a failed save removes the new upload", async () => {
    patchOk = false
    expect(
      await updateDoorSound(deps(), { path: NEW, mode: "sound_only" })
    ).toEqual({ ok: false, error: SAVE_SOUND_FAILED })
    expect(removed()).toEqual([NEW])
  })
})

describe("clearDoorSound", () => {
  test("clears the path and falls back to voice only", async () => {
    expect(await clearDoorSound(member(), USER)).toEqual({
      ok: true,
      path: null,
      mode: "voice_only",
    })
    expect(patches()).toEqual([
      { door_sound_path: null, door_sound_mode: "voice_only" },
    ])
  })
})

describe("removeStaleDoorSounds", () => {
  const now = Date.parse("2026-09-23T12:30:00Z")

  test("removes the replaced file and old orphans, keeps fresh uploads", async () => {
    listing = [
      {
        name: "20260901000000-aaaaaaaa.mp3",
        id: "1",
        created_at: "2026-09-01T00:00:00Z",
      },
      {
        name: "20260923120000-bbbbbbbb.m4a",
        id: "2",
        created_at: "2026-09-23T12:29:00Z",
      },
      {
        name: "20260923110000-cccccccc.ogg",
        id: "3",
        created_at: "2026-09-23T11:00:00Z",
      },
      {
        name: "20260923122500-dddddddd.wav",
        id: "4",
        created_at: "2026-09-23T12:25:00Z",
      },
    ]
    const paths = await removeStaleDoorSounds(admin(), USER, {
      keep: NEW,
      previous: OLD,
      now,
    })
    expect(paths.sort()).toEqual(
      [OLD, `${USER}/20260923110000-cccccccc.ogg`].sort()
    )
    expect(removed().sort()).toEqual(paths.sort())
    const list = calls.find((c) => c.url.includes("/object/list/"))
    expect((list?.body as { prefix: string }).prefix).toBe(USER)
    expect(list?.apikey).toBe("service-key")
  })

  test("a delete clears the whole folder", async () => {
    listing = [
      {
        name: "20260923122500-dddddddd.wav",
        id: "4",
        created_at: "2026-09-23T12:29:59Z",
      },
    ]
    const paths = await removeStaleDoorSounds(admin(), USER, {
      keep: null,
      previous: null,
      now,
      graceMs: 0,
    })
    expect(paths).toEqual([`${USER}/20260923122500-dddddddd.wav`])
  })

  test("nothing to remove means no delete call", async () => {
    expect(
      await removeStaleDoorSounds(admin(), USER, {
        keep: NEW,
        previous: NEW,
        now,
      })
    ).toEqual([])
    expect(removed()).toEqual([])
  })
})

describe("signOwnDoorSound", () => {
  test("signs only the member's own file", async () => {
    expect(await signOwnDoorSound(admin(), USER, `${OTHER}/x.mp3`)).toBeNull()
    expect(calls).toHaveLength(0)
    expect(await signOwnDoorSound(admin(), USER, OLD)).toBe(
      "https://database.example/storage/v1/object/sign/door-sounds/x?token=t"
    )
  })
})
