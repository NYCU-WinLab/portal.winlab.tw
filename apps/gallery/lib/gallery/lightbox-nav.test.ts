import { describe, expect, test } from "bun:test"

import {
  nextSequenceIndex,
  resolveLightboxNextStep,
  resolveLightboxPrevStep,
} from "@/lib/gallery/lightbox-nav"

describe("resolveLightboxPrevStep", () => {
  test("moves within sequence before wall", () => {
    expect(resolveLightboxPrevStep(2, 4, true)).toBe("sequence")
  })

  test("moves to wall at sequence start", () => {
    expect(resolveLightboxPrevStep(0, 4, true)).toBe("wall")
  })

  test("wraps sequence when no wall prev", () => {
    expect(resolveLightboxPrevStep(0, 4, false)).toBe("sequence-wrap")
  })
})

describe("resolveLightboxNextStep", () => {
  test("moves to wall at sequence end", () => {
    expect(resolveLightboxNextStep(3, 4, true)).toBe("wall")
  })
})

describe("nextSequenceIndex", () => {
  test("wraps at edges", () => {
    expect(nextSequenceIndex(0, 3, "prev")).toBe(2)
    expect(nextSequenceIndex(2, 3, "next")).toBe(0)
  })
})
