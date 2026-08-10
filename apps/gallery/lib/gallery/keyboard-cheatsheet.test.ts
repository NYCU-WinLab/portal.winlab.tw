import { describe, expect, test } from "bun:test"

import {
  GALLERY_MANAGE_SHORTCUTS,
  GALLERY_MEMORIES_SHORTCUTS,
  GALLERY_SLIDESHOW_SHORTCUTS,
  GALLERY_WALL_SHORTCUTS,
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

describe("GALLERY_WALL_SHORTCUTS", () => {
  test("documents Esc closing cheat sheet before Select/filters/offline", () => {
    const esc = GALLERY_WALL_SHORTCUTS.find((row) => row.keys.includes("Esc"))
    expect(esc?.action.toLowerCase()).toContain("cheat sheet")
    expect(esc?.action.toLowerCase()).toContain("filter")
    expect(esc?.action.toLowerCase()).toContain("offline")
  })
})

describe("GALLERY_MANAGE_SHORTCUTS", () => {
  test("covers Select-mode keys", () => {
    const joined = GALLERY_MANAGE_SHORTCUTS.flatMap((row) => row.keys).join(" ")
    expect(joined).toContain("click")
    expect(joined).toContain("A")
    expect(joined).toContain("J")
    expect(joined).toContain("K")
    expect(joined).toContain("Space")
    expect(joined).toContain("Shift+click")
    expect(joined).toContain("Esc")
    expect(joined).toContain("?")
  })

  test("documents Esc closing cheat sheet before Select/filters/offline", () => {
    const esc = GALLERY_MANAGE_SHORTCUTS.find((row) => row.keys.includes("Esc"))
    expect(esc?.action.toLowerCase()).toContain("cheat sheet")
    expect(esc?.action.toLowerCase()).toContain("filter")
    expect(esc?.action.toLowerCase()).toContain("offline")
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

describe("GALLERY_MEMORIES_SHORTCUTS", () => {
  test("covers prev/next calendar day", () => {
    const joined = GALLERY_MEMORIES_SHORTCUTS.flatMap((row) => row.keys).join(
      " "
    )
    expect(joined).toContain("←")
    expect(joined).toContain("→")
    expect(joined).toContain("J")
    expect(joined).toContain("K")
    expect(joined).toContain("T")
    expect(joined).toContain("?")
  })
})
