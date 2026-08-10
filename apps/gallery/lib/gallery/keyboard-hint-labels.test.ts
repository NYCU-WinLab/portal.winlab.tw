import { describe, expect, test } from "bun:test"

import {
  describeLightboxHintLabel,
  describeManageSelectHintLabel,
  shouldOpenReactionFromSignal,
} from "@/lib/gallery/keyboard-hint-labels"

describe("describeLightboxHintLabel", () => {
  test("mentions navigate, react, share, and cheat sheet", () => {
    const label = describeLightboxHintLabel()
    expect(label).toContain("← →")
    expect(label).toContain("R")
    expect(label).toContain("S")
    expect(label).toContain("?")
  })
})

describe("describeManageSelectHintLabel", () => {
  test("mentions focus, toggle, range, and select-all", () => {
    const label = describeManageSelectHintLabel()
    expect(label).toContain("J/K")
    expect(label).toContain("Space")
    expect(label).toContain("Shift+click")
    expect(label).toContain("A")
  })
})

describe("shouldOpenReactionFromSignal", () => {
  test("opens only on a new positive signal", () => {
    expect(shouldOpenReactionFromSignal(0, 1)).toBe(true)
    expect(shouldOpenReactionFromSignal(1, 2)).toBe(true)
    expect(shouldOpenReactionFromSignal(2, 2)).toBe(false)
    expect(shouldOpenReactionFromSignal(0, 0)).toBe(false)
  })
})
