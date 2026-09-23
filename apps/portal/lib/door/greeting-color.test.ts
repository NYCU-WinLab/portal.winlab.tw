import { describe, expect, test } from "bun:test"

import {
  COLOR_INVALID_FORMAT,
  COLOR_TOO_DARK,
  DOOR_COLOR_DEFAULT,
  DOOR_COLOR_PRESETS,
  isDoorGreetingColor,
  maxChannel,
  parseDoorGreetingColor,
} from "@/lib/door/greeting-color"

describe("maxChannel", () => {
  test("reads the brightest of r, g and b", () => {
    expect(maxChannel("#ff0000")).toBe(255)
    expect(maxChannel("#00ff00")).toBe(255)
    expect(maxChannel("#0000ff")).toBe(255)
    expect(maxChannel("#123456")).toBe(0x56)
    expect(maxChannel("#000000")).toBe(0)
  })

  test("is null for anything that is not lower-case #rrggbb", () => {
    expect(maxChannel("#FFFFFF")).toBeNull()
    expect(maxChannel("#fff")).toBeNull()
    expect(maxChannel("ffffff")).toBeNull()
    expect(maxChannel("#gggggg")).toBeNull()
    expect(maxChannel("#ffffff\n")).toBeNull()
  })
})

describe("isDoorGreetingColor", () => {
  test("128 on any channel is the threshold", () => {
    expect(isDoorGreetingColor("#800000")).toBe(true)
    expect(isDoorGreetingColor("#008000")).toBe(true)
    expect(isDoorGreetingColor("#000080")).toBe(true)
    expect(isDoorGreetingColor("#7f7f7f")).toBe(false)
    expect(isDoorGreetingColor("#000000")).toBe(false)
  })

  test("rejects non-strings and bad formats", () => {
    expect(isDoorGreetingColor(null)).toBe(false)
    expect(isDoorGreetingColor(0xffffff)).toBe(false)
    expect(isDoorGreetingColor("#FFFFFF")).toBe(false)
  })

  test("every preset and the default are bright enough", () => {
    expect(DOOR_COLOR_PRESETS).toHaveLength(8)
    for (const preset of DOOR_COLOR_PRESETS) {
      expect(isDoorGreetingColor(preset.value)).toBe(true)
    }
    expect(isDoorGreetingColor(DOOR_COLOR_DEFAULT)).toBe(true)
  })
})

describe("parseDoorGreetingColor", () => {
  test("normalises case and surrounding whitespace", () => {
    expect(parseDoorGreetingColor("#FF4040")).toEqual({
      ok: true,
      value: "#ff4040",
    })
    expect(parseDoorGreetingColor("  #33E6ff ")).toEqual({
      ok: true,
      value: "#33e6ff",
    })
  })

  test("null and empty mean the panel default", () => {
    expect(parseDoorGreetingColor(null)).toEqual({ ok: true, value: null })
    expect(parseDoorGreetingColor("")).toEqual({ ok: true, value: null })
    expect(parseDoorGreetingColor("   ")).toEqual({ ok: true, value: null })
  })

  test("rejects anything that is not #rrggbb", () => {
    for (const input of [
      "#fff",
      "ffffff",
      "#fffffff",
      "#gggggg",
      "red",
      "rgb(255, 0, 0)",
      "#ff fff",
    ]) {
      expect(parseDoorGreetingColor(input)).toEqual({
        ok: false,
        error: COLOR_INVALID_FORMAT,
      })
    }
  })

  test("rejects a colour too dark to read on an LED", () => {
    expect(parseDoorGreetingColor("#7f7f7f")).toEqual({
      ok: false,
      error: COLOR_TOO_DARK,
    })
    expect(parseDoorGreetingColor("#1A1A1A")).toEqual({
      ok: false,
      error: COLOR_TOO_DARK,
    })
  })

  test("rejects non-string input and oversized strings", () => {
    expect(parseDoorGreetingColor(undefined).ok).toBe(false)
    expect(parseDoorGreetingColor(0xffffff).ok).toBe(false)
    expect(parseDoorGreetingColor({ color: "#ffffff" }).ok).toBe(false)
    expect(parseDoorGreetingColor("#ffffff".repeat(10))).toEqual({
      ok: false,
      error: COLOR_INVALID_FORMAT,
    })
  })
})
