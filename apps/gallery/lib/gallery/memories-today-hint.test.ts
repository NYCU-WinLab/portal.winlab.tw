import { describe, expect, test } from "bun:test"

import { describeMemoriesTodayShortcutHint } from "@/lib/gallery/memories-today-hint"

describe("describeMemoriesTodayShortcutHint", () => {
  test("hides when already viewing today", () => {
    expect(describeMemoriesTodayShortcutHint(true)).toBeNull()
  })

  test("mentions T when looking at another day", () => {
    expect(describeMemoriesTodayShortcutHint(false)).toContain("T")
  })
})
