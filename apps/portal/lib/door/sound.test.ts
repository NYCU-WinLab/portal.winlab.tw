import { describe, expect, test } from "bun:test"

import {
  DOOR_SOUND_ACCEPT,
  DOOR_SOUND_MAX_BYTES,
  doorSoundExtension,
  isDoorSoundMode,
  isDoorSoundPath,
  isDoorSoundPlayMode,
  looksLikeDoorSound,
  newDoorSoundPath,
  SOUND_BAD_TYPE,
  SOUND_EMPTY,
  SOUND_TOO_LARGE,
  validateDoorSoundFile,
} from "@/lib/door/sound"

const USER = "51111111-1111-1111-1111-111111111111"
const OTHER = "52222222-2222-2222-2222-222222222222"

const file = (name: string, size = 1000, type = "") => ({ name, size, type })
const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) =>
      typeof v === "string" ? Array.from(v, (c) => c.charCodeAt(0)) : [v]
    )
  )

describe("validateDoorSoundFile", () => {
  test("accepts each extension and sends one fixed content type for it", () => {
    expect(validateDoorSoundFile(file("a.mp3", 1, "audio/mpeg"))).toEqual({
      ok: true,
      ext: "mp3",
      contentType: "audio/mpeg",
    })
    expect(validateDoorSoundFile(file("a.M4A", 1, "audio/x-m4a"))).toEqual({
      ok: true,
      ext: "m4a",
      contentType: "audio/mp4",
    })
    expect(validateDoorSoundFile(file("a.aac"))).toMatchObject({
      ok: true,
      contentType: "audio/aac",
    })
    expect(
      validateDoorSoundFile(file("a.wav", 1, "audio/x-wav"))
    ).toMatchObject({ ok: true, contentType: "audio/wav" })
    expect(
      validateDoorSoundFile(file("a.ogg", 1, "application/ogg"))
    ).toMatchObject({ ok: true, contentType: "audio/ogg" })
  })

  test("rejects other extensions and a type that contradicts the extension", () => {
    expect(validateDoorSoundFile(file("a.flac"))).toEqual({
      ok: false,
      error: SOUND_BAD_TYPE,
    })
    expect(validateDoorSoundFile(file("mp3"))).toEqual({
      ok: false,
      error: SOUND_BAD_TYPE,
    })
    expect(validateDoorSoundFile(file("a.mp3", 1, "image/png"))).toEqual({
      ok: false,
      error: SOUND_BAD_TYPE,
    })
  })

  test("enforces the 3 MB limit and rejects empty files", () => {
    expect(DOOR_SOUND_MAX_BYTES).toBe(3 * 1024 * 1024)
    expect(validateDoorSoundFile(file("a.mp3", DOOR_SOUND_MAX_BYTES)).ok).toBe(
      true
    )
    expect(
      validateDoorSoundFile(file("a.mp3", DOOR_SOUND_MAX_BYTES + 1))
    ).toEqual({ ok: false, error: SOUND_TOO_LARGE })
    expect(validateDoorSoundFile(file("a.mp3", 0))).toEqual({
      ok: false,
      error: SOUND_EMPTY,
    })
  })

  test("the picker accept list covers every extension", () => {
    for (const ext of [".mp3", ".m4a", ".aac", ".wav", ".ogg"]) {
      expect(DOOR_SOUND_ACCEPT.split(",")).toContain(ext)
    }
    expect(doorSoundExtension(" clip.Ogg ")).toBe("ogg")
    expect(doorSoundExtension("clip.toString")).toBeNull()
  })
})

describe("looksLikeDoorSound", () => {
  test("recognises each container's first bytes", () => {
    expect(looksLikeDoorSound("mp3", bytes("ID3", 4, 0))).toBe(true)
    expect(looksLikeDoorSound("mp3", bytes(0xff, 0xfb, 0x90))).toBe(true)
    expect(looksLikeDoorSound("aac", bytes(0xff, 0xf1, 0x50))).toBe(true)
    expect(looksLikeDoorSound("m4a", bytes(0, 0, 0, 0x20, "ftypM4A "))).toBe(
      true
    )
    expect(looksLikeDoorSound("wav", bytes("RIFF", 1, 2, 3, 4, "WAVE"))).toBe(
      true
    )
    expect(looksLikeDoorSound("ogg", bytes("OggS", 0))).toBe(true)
  })

  test("rejects a renamed image or PDF", () => {
    const png = bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)
    const pdf = bytes("%PDF-1.7")
    for (const ext of ["mp3", "m4a", "aac", "wav", "ogg"] as const) {
      expect(looksLikeDoorSound(ext, png)).toBe(false)
      expect(looksLikeDoorSound(ext, pdf)).toBe(false)
    }
    expect(looksLikeDoorSound("wav", bytes("RIFF", 1, 2, 3, 4, "AVI "))).toBe(
      false
    )
  })
})

describe("paths", () => {
  test("a new path is in the member's folder and passes the path check", () => {
    const path = newDoorSoundPath(
      USER,
      "m4a",
      new Date("2026-09-23T12:34:56.789Z"),
      "abcd1234"
    )
    expect(path).toBe(`${USER}/20260923123456-abcd1234.m4a`)
    expect(isDoorSoundPath(path, USER)).toBe(true)
    expect(isDoorSoundPath(newDoorSoundPath(USER, "mp3"), USER)).toBe(true)
  })

  test("rejects another member's folder, nesting, traversal and bad names", () => {
    expect(isDoorSoundPath(`${OTHER}/x.mp3`, USER)).toBe(false)
    expect(isDoorSoundPath(`${USER}/a/x.mp3`, USER)).toBe(false)
    expect(isDoorSoundPath(`${USER}/../${OTHER}/x.mp3`, USER)).toBe(false)
    expect(isDoorSoundPath(`${USER}/x.flac`, USER)).toBe(false)
    expect(isDoorSoundPath(`${USER}/x.MP3`, USER)).toBe(false)
    expect(isDoorSoundPath(`${USER}/.mp3`, USER)).toBe(false)
    expect(isDoorSoundPath(`x.mp3`, USER)).toBe(false)
    expect(isDoorSoundPath(null, USER)).toBe(false)
    expect(isDoorSoundPath(`/x.mp3`, "")).toBe(false)
  })
})

describe("modes", () => {
  test("knows the three modes and which play a file", () => {
    expect(isDoorSoundMode("sound_only")).toBe(true)
    expect(isDoorSoundMode("sound_then_voice")).toBe(true)
    expect(isDoorSoundMode("voice_only")).toBe(true)
    expect(isDoorSoundMode("loud")).toBe(false)
    expect(isDoorSoundPlayMode("voice_only")).toBe(false)
    expect(isDoorSoundPlayMode("sound_only")).toBe(true)
    expect(isDoorSoundPlayMode(null)).toBe(false)
  })
})
