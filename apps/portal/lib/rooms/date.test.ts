import { describe, expect, test } from "bun:test"

import { taipeiIso } from "./date"

describe("taipeiIso", () => {
  test("converts an Asia/Taipei date+time into the equivalent UTC instant", () => {
    expect(taipeiIso("2026-08-01", "10:00")).toBe("2026-08-01T02:00:00.000Z")
  })

  test("handles a time that crosses midnight UTC", () => {
    expect(taipeiIso("2026-08-01", "07:30")).toBe("2026-07-31T23:30:00.000Z")
  })
})
