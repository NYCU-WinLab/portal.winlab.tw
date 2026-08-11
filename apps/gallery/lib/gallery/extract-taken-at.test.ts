import { describe, expect, test } from "bun:test"

import {
  normalizeTakenAtCandidate,
  resolveTakenAtFromExifFields,
  sanitizeClientTakenAt,
} from "./extract-taken-at"

describe("normalizeTakenAtCandidate", () => {
  test("accepts Date and ISO strings", () => {
    const iso = "2024-08-10T04:00:00.000Z"
    expect(normalizeTakenAtCandidate(new Date(iso))).toBe(iso)
    expect(normalizeTakenAtCandidate(iso)).toBe(iso)
  })

  test("parses classic EXIF colon dates as Taipei wall time", () => {
    // 12:00 Taipei == 04:00 UTC
    expect(normalizeTakenAtCandidate("2024:08:10 12:00:00")).toBe(
      "2024-08-10T04:00:00.000Z"
    )
  })

  test("rejects empty and out-of-range values", () => {
    expect(normalizeTakenAtCandidate("")).toBeNull()
    expect(normalizeTakenAtCandidate("not-a-date")).toBeNull()
    expect(normalizeTakenAtCandidate("1899-01-01T00:00:00.000Z")).toBeNull()
    expect(normalizeTakenAtCandidate("2200-01-01T00:00:00.000Z")).toBeNull()
  })
})

describe("resolveTakenAtFromExifFields", () => {
  test("prefers DateTimeOriginal over ModifyDate", () => {
    expect(
      resolveTakenAtFromExifFields({
        DateTimeOriginal: "2023:05:01 08:00:00",
        ModifyDate: "2024:01:01 00:00:00",
      })
    ).toBe("2023-05-01T00:00:00.000Z")
  })

  test("falls through when original is missing", () => {
    expect(
      resolveTakenAtFromExifFields({
        CreateDate: "2022:12:25 18:30:00",
      })
    ).toBe("2022-12-25T10:30:00.000Z")
  })

  test("returns null for empty fields", () => {
    expect(resolveTakenAtFromExifFields(null)).toBeNull()
    expect(resolveTakenAtFromExifFields({})).toBeNull()
  })
})

describe("sanitizeClientTakenAt", () => {
  test("trims and validates", () => {
    expect(sanitizeClientTakenAt(" 2024-08-10T04:00:00.000Z ")).toBe(
      "2024-08-10T04:00:00.000Z"
    )
    expect(sanitizeClientTakenAt("nope")).toBeNull()
    expect(sanitizeClientTakenAt(undefined)).toBeNull()
  })
})
