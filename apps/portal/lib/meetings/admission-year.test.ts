import { describe, expect, test } from "bun:test"

import {
  admissionYearFromStudentId,
  admissionYearLabel,
  formatAdmissionYear,
  parseAdmissionYear,
} from "./admission-year"

describe("parseAdmissionYear", () => {
  test("reads the zero-padded form Keycloak stores", () => {
    expect(parseAdmissionYear("095")).toBe(95)
    expect(parseAdmissionYear("113")).toBe(113)
  })

  test("accepts an unpadded value too — humans type 95, not 095", () => {
    expect(parseAdmissionYear("95")).toBe(95)
  })

  test("tolerates surrounding whitespace", () => {
    expect(parseAdmissionYear("  113  ")).toBe(113)
  })

  // A 西元 year is a different unit, not a formatting variant. Converting it
  // would guess at intent, and the realm rejects the result anyway.
  test("rejects a 西元 year rather than converting it", () => {
    expect(parseAdmissionYear("2024")).toBeNull()
  })

  test("rejects values outside the realm's own accepted range", () => {
    expect(parseAdmissionYear("89")).toBeNull()
    expect(parseAdmissionYear("200")).toBeNull()
  })

  test("rejects empty and non-numeric input", () => {
    expect(parseAdmissionYear("")).toBeNull()
    expect(parseAdmissionYear(null)).toBeNull()
    expect(parseAdmissionYear(undefined)).toBeNull()
    expect(parseAdmissionYear("AT7837")).toBeNull()
  })
})

describe("formatAdmissionYear", () => {
  test("pads to the three characters Keycloak requires", () => {
    expect(formatAdmissionYear(95)).toBe("095")
    expect(formatAdmissionYear(113)).toBe("113")
  })

  test("round-trips through parseAdmissionYear", () => {
    for (const year of [90, 95, 99, 100, 113, 115, 199]) {
      expect(parseAdmissionYear(formatAdmissionYear(year))).toBe(year)
    }
  })
})

describe("admissionYearFromStudentId", () => {
  // 313552013 is the example in lib/profile/schema.ts's format comment.
  test("reads digits 2-3 of a 9-digit ID", () => {
    expect(admissionYearFromStudentId("313552013")).toBe(113)
    expect(admissionYearFromStudentId("411551020")).toBe(111)
  })

  test("reads the first two digits of a 7-digit ID", () => {
    expect(admissionYearFromStudentId("9517137")).toBe(95)
    expect(admissionYearFromStudentId("9117005")).toBe(91)
  })

  // "05" is 民國 105, not 5 — the pre-110 format dropped the leading 1.
  test("expands a head below 20 to the 100s", () => {
    expect(admissionYearFromStudentId("0556184")).toBe(105)
    expect(admissionYearFromStudentId("1005853")).toBe(110)
  })

  test("rejects staff numbers and other non-student formats", () => {
    expect(admissionYearFromStudentId("AT7837")).toBeNull()
    expect(admissionYearFromStudentId("12345")).toBeNull()
    expect(admissionYearFromStudentId("")).toBeNull()
    expect(admissionYearFromStudentId(null)).toBeNull()
  })
})

describe("admissionYearLabel", () => {
  test("labels a cohort the way the lab says it", () => {
    expect(admissionYearLabel(113)).toBe("113 級")
  })
})
