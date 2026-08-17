import { describe, expect, test } from "bun:test"

import {
  describeBulkTagAttach,
  describeBulkTagDetach,
} from "@/lib/gallery/bulk-tag"

describe("describeBulkTagAttach", () => {
  test("all attached", () => {
    expect(
      describeBulkTagAttach({
        tagName: "lab-day",
        attached: 3,
        selected: 3,
      })
    ).toBe("Tagged 3 photos with “lab-day”.")
  })

  test("partial", () => {
    expect(
      describeBulkTagAttach({
        tagName: "lab-day",
        attached: 1,
        selected: 4,
      })
    ).toBe("Tagged 1 of 4 photos with “lab-day”.")
  })

  test("none", () => {
    expect(
      describeBulkTagAttach({
        tagName: "lab-day",
        attached: 0,
        selected: 2,
      })
    ).toMatch(/already on those photos/)
  })
})

describe("describeBulkTagDetach", () => {
  test("none", () => {
    expect(describeBulkTagDetach({ tagName: "lab-day", detached: 0 })).toMatch(
      /None of those photos/
    )
  })

  test("some", () => {
    expect(describeBulkTagDetach({ tagName: "lab-day", detached: 2 })).toBe(
      "Removed “lab-day” from 2 photos."
    )
  })
})
