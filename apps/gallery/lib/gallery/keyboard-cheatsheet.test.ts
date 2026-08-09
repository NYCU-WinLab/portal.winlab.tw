import { describe, expect, test } from "bun:test"

import {
  GALLERY_MANAGE_SHORTCUTS,
  GALLERY_SLIDESHOW_SHORTCUTS,
  isCheatSheetToggleKey,
} from "@/lib/gallery/keyboard-cheatsheet"

describe("isCheatSheetToggleKey", () => {
  test("accepts ? and Shift+/", () => {
    expect(isCheatSheetToggleKey("?", false)).toBe(true)
    expect(isCheatSheetToggleKey("/", true)).toBe(true)
    expect(isCheatSheetToggleKey("/", false)).toBe(false)
    expect(isCheatSheetToggleKey("a", false)).toBe(false)
  })
})

describe("GALLERY_MANAGE_SHORTCUTS", () => {
  test("covers Select-mode keys", () => {
    const joined = GALLERY_MANAGE_SHORTCUTS.flatMap((row) => row.keys).join(" ")
    expect(joined).toContain("A")
    expect(joined).toContain("Shift+click")
    expect(joined).toContain("Esc")
    expect(joined).toContain("?")
  })
})

describe("GALLERY_SLIDESHOW_SHORTCUTS", () => {
  test("covers pause, speed, and step", () => {
    const joined = GALLERY_SLIDESHOW_SHORTCUTS.flatMap((row) => row.keys).join(
      " "
    )
    expect(joined).toContain("Space")
    expect(joined).toContain("[")
    expect(joined).toContain("]")
    expect(joined).toContain("Home")
    expect(joined).toContain("End")
    expect(joined).toContain("Esc")
  })
})
