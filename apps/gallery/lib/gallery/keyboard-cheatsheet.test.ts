import { describe, expect, test } from "bun:test"

import { isCheatSheetToggleKey } from "@/lib/gallery/keyboard-cheatsheet"

describe("isCheatSheetToggleKey", () => {
  test("accepts ? and Shift+/", () => {
    expect(isCheatSheetToggleKey("?", false)).toBe(true)
    expect(isCheatSheetToggleKey("/", true)).toBe(true)
    expect(isCheatSheetToggleKey("/", false)).toBe(false)
    expect(isCheatSheetToggleKey("j", false)).toBe(false)
  })
})
