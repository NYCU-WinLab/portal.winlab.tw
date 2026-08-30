import { describe, expect, test } from "bun:test"

import {
  admissionYearFromStudentId,
  admissionYearLabel,
  formatAdmissionYear,
  parseAdmissionYear,
  tierGradeLabel,
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

describe("tierGradeLabel", () => {
  // 學年度 115、民國 114 入學 → 第二年 → 碩二
  test("combines tier and year-in-programme", () => {
    expect(tierGradeLabel("master", 115, 114)).toBe("碩二")
    expect(tierGradeLabel("master", 115, 115)).toBe("碩一")
    expect(tierGradeLabel("doctoral", 115, 113)).toBe("博三")
    expect(tierGradeLabel("undergrad", 115, 112)).toBe("大四")
  })

  // 教職、助理、校友沒有年級可言 —— 標一個假的比不標更糟。
  test("has no label for tiers without a year-in-programme", () => {
    expect(tierGradeLabel("teacher", 115, 100)).toBeNull()
    expect(tierGradeLabel("assistant", 115, 100)).toBeNull()
    expect(tierGradeLabel("alumni", 115, 110)).toBeNull()
    expect(tierGradeLabel(null, 115, 114)).toBeNull()
  })

  // 延畢是真的：碩五、碩六照樣標出來，不要靜靜地變成 null。
  test("keeps labelling beyond the nominal length", () => {
    expect(tierGradeLabel("master", 115, 111)).toBe("碩五")
  })

  // 入學年比學年度還晚，或早得離譜 —— 資料有問題，不要編一個名字出來。
  test("returns null for an out-of-range year", () => {
    expect(tierGradeLabel("master", 115, 116)).toBeNull()
    expect(tierGradeLabel("master", 115, 100)).toBeNull()
  })
})
