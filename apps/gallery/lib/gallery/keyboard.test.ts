import { describe, expect, test } from "bun:test"

import { isTypingTarget } from "@/lib/gallery/keyboard"

function fakeTarget(partial: {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => Element | null
}): EventTarget {
  return partial as unknown as EventTarget
}

describe("isTypingTarget", () => {
  test("returns false for null", () => {
    expect(isTypingTarget(null)).toBe(false)
  })

  test("returns true for form fields and contentEditable", () => {
    expect(isTypingTarget(fakeTarget({ tagName: "INPUT" }))).toBe(true)
    expect(isTypingTarget(fakeTarget({ tagName: "TEXTAREA" }))).toBe(true)
    expect(isTypingTarget(fakeTarget({ tagName: "SELECT" }))).toBe(true)
    expect(
      isTypingTarget(fakeTarget({ tagName: "DIV", isContentEditable: true }))
    ).toBe(true)
  })

  test("returns true for video/audio and descendants", () => {
    expect(isTypingTarget(fakeTarget({ tagName: "VIDEO" }))).toBe(true)
    expect(isTypingTarget(fakeTarget({ tagName: "AUDIO" }))).toBe(true)
    expect(
      isTypingTarget(
        fakeTarget({
          tagName: "DIV",
          closest: (selector: string) =>
            selector.includes("video") ? ({} as Element) : null,
        })
      )
    ).toBe(true)
  })

  test("returns false for ordinary elements", () => {
    expect(
      isTypingTarget(
        fakeTarget({
          tagName: "BUTTON",
          closest: () => null,
        })
      )
    ).toBe(false)
  })
})
