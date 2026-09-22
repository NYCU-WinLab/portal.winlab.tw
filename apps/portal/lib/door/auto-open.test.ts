import { describe, expect, test } from "bun:test"

import {
  readLaunchKind,
  shouldAutoOpen,
  type DoorLaunchKind,
} from "@/lib/door/auto-open"

const perfWith = (entries: unknown[]) => ({
  getEntriesByType: () => entries as PerformanceEntry[],
})

describe("shouldAutoOpen", () => {
  test("a fresh navigation is the home-screen launch we act on", () => {
    expect(shouldAutoOpen("navigate")).toBe(true)
  })

  // Each of these is the page coming back without anyone asking for a door.
  const uninvited: DoorLaunchKind[] = ["reload", "back_forward"]
  for (const kind of uninvited) {
    test(`${kind} never opens the door`, () => {
      expect(shouldAutoOpen(kind)).toBe(false)
    })
  }

  // Old browsers and some privacy modes report nothing. Unknown is not consent.
  test("an unreadable launch kind does not open the door", () => {
    expect(shouldAutoOpen(undefined)).toBe(false)
  })

  // The spec has values this TypeScript lib's NavigationTimingType does not
  // carry yet (prerender). The check is an allow-list for exactly one value so
  // a browser inventing a new one can never be read as a request to open.
  test("a launch kind nobody has heard of does not open the door", () => {
    expect(shouldAutoOpen("prerender" as DoorLaunchKind)).toBe(false)
    expect(shouldAutoOpen("something-new" as DoorLaunchKind)).toBe(false)
  })
})

describe("readLaunchKind", () => {
  test("reads the type off the navigation entry", () => {
    expect(readLaunchKind(perfWith([{ type: "navigate" }]))).toBe("navigate")
  })

  test("returns undefined when the browser reports no entry", () => {
    expect(readLaunchKind(perfWith([]))).toBeUndefined()
  })
})
