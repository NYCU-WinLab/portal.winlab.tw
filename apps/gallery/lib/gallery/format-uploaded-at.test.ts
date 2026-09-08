import { describe, expect, test } from "bun:test"

import { formatUploadedAt, formatUploadedDate } from "./format-uploaded-at"

describe("formatUploadedAt", () => {
  test("returns empty string for invalid input", () => {
    expect(formatUploadedAt("not-a-date")).toBe("")
  })

  test("is deterministic (en-US) for the same ISO string", () => {
    const iso = "2026-08-05T15:24:00.000Z"
    expect(formatUploadedAt(iso)).toBe(formatUploadedAt(iso))
    expect(formatUploadedAt(iso)).toContain("2026")
  })
})

describe("formatUploadedDate", () => {
  test("returns empty string for invalid input", () => {
    expect(formatUploadedDate("not-a-date")).toBe("")
  })

  test("is deterministic (en-US) for the same ISO string", () => {
    const iso = "2026-08-05T15:24:00.000Z"
    expect(formatUploadedDate(iso)).toBe(formatUploadedDate(iso))
    expect(formatUploadedDate(iso)).toContain("2026")
  })
})
