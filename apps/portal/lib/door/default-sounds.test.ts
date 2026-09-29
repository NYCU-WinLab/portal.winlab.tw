import { describe, expect, test } from "bun:test"

import {
  buildPanelDefaultSounds,
  defaultSoundPaths,
  isDefaultSoundPath,
  LABEL_EMPTY,
  LABEL_TOO_LONG,
  newDefaultSoundPath,
  normalizeDefaultSoundLabel,
  type DefaultSoundRow,
} from "./default-sounds"

const row = (over: Partial<DefaultSoundRow>): DefaultSoundRow => ({
  id: "d1",
  label: "預設",
  path: "defaults/20260929000000-aaaaaaaa.mp3",
  enabled: true,
  created_at: "2026-09-29T00:00:00Z",
  ...over,
})

describe("isDefaultSoundPath", () => {
  test("accepts a file directly under defaults/ with a sound extension", () => {
    expect(isDefaultSoundPath("defaults/20260929000000-aaaaaaaa.mp3")).toBe(
      true
    )
    expect(isDefaultSoundPath("defaults/x_Y-1.ogg")).toBe(true)
  })

  test("rejects member folders, subfolders and other extensions", () => {
    expect(
      isDefaultSoundPath("9155594a-9c4a-47e7-aac1-615551ec869a/x.mp3")
    ).toBe(false)
    expect(isDefaultSoundPath("defaults/nested/x.mp3")).toBe(false)
    expect(isDefaultSoundPath("defaults/x.exe")).toBe(false)
    expect(isDefaultSoundPath("defaults/../x.mp3")).toBe(false)
    expect(isDefaultSoundPath(null)).toBe(false)
  })
})

describe("normalizeDefaultSoundLabel", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeDefaultSoundLabel("  Hot   Limit ")).toEqual({
      ok: true,
      label: "Hot Limit",
    })
  })

  test("rejects an empty or non-string label", () => {
    expect(normalizeDefaultSoundLabel("   ")).toEqual({
      ok: false,
      error: LABEL_EMPTY,
    })
    expect(normalizeDefaultSoundLabel(42)).toEqual({
      ok: false,
      error: LABEL_EMPTY,
    })
  })

  test("counts characters, not UTF-16 units, against the 40 limit", () => {
    expect(normalizeDefaultSoundLabel("🎵".repeat(40)).ok).toBe(true)
    expect(normalizeDefaultSoundLabel("音".repeat(41))).toEqual({
      ok: false,
      error: LABEL_TOO_LONG,
    })
  })
})

test("newDefaultSoundPath makes a path the column check accepts", () => {
  const path = newDefaultSoundPath(
    "m4a",
    new Date("2026-09-29T08:30:15.123Z"),
    "abcd1234"
  )
  expect(path).toBe("defaults/20260929083015-abcd1234.m4a")
  expect(isDefaultSoundPath(path)).toBe(true)
  expect(isDefaultSoundPath(newDefaultSoundPath("mp3"))).toBe(true)
})

test("defaultSoundPaths signs only enabled sounds with a valid path", () => {
  expect(
    defaultSoundPaths([
      row({ id: "a" }),
      row({ id: "b", path: "defaults/b.ogg", enabled: false }),
      row({ id: "c", path: "u1/c.mp3" }),
    ])
  ).toEqual(["defaults/20260929000000-aaaaaaaa.mp3"])
})

describe("buildPanelDefaultSounds", () => {
  const rows = [
    row({
      id: "b",
      path: "defaults/b.mp3",
      created_at: "2026-09-29T02:00:00Z",
    }),
    row({
      id: "a",
      path: "defaults/a.mp3",
      created_at: "2026-09-29T01:00:00Z",
    }),
    row({ id: "off", path: "defaults/off.mp3", enabled: false }),
    row({ id: "gone", path: "defaults/gone.mp3" }),
  ]
  const signed = new Map([
    ["defaults/a.mp3", "https://signed/a"],
    ["defaults/b.mp3", "https://signed/b"],
    ["defaults/off.mp3", "https://signed/off"],
  ])

  test("lists enabled, signed sounds oldest first, version is the path", () => {
    expect(buildPanelDefaultSounds(rows, signed)).toEqual([
      { url: "https://signed/a", version: "defaults/a.mp3", label: "預設" },
      { url: "https://signed/b", version: "defaults/b.mp3", label: "預設" },
    ])
  })

  test("the order does not depend on the order rows came back in", () => {
    expect(buildPanelDefaultSounds([...rows].reverse(), signed)).toEqual(
      buildPanelDefaultSounds(rows, signed)
    )
  })

  test("an empty pool is an empty list", () => {
    expect(buildPanelDefaultSounds([], signed)).toEqual([])
  })
})
