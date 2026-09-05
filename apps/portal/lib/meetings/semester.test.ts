import { describe, expect, it } from "bun:test"

import { currentAcademicYear, semesterKeyForDate } from "./semester"

// Every case here is checked against the SQL these functions mirror
// (public.meeting_academic_year / public.meeting_term). The boundaries are the
// point: August opens 上學期, January is still 上學期, February opens 下學期.
describe("semesterKeyForDate", () => {
  it("puts September in 上學期 of the year just beginning", () => {
    expect(semesterKeyForDate("2026-09-04")).toEqual({
      academicYear: 115,
      term: 1,
    })
  })

  it("opens the academic year on 1 August, not 1 September", () => {
    expect(semesterKeyForDate("2026-08-01")).toEqual({
      academicYear: 115,
      term: 1,
    })
    expect(semesterKeyForDate("2026-07-31")).toEqual({
      academicYear: 114,
      term: 2,
    })
  })

  it("keeps January in 上學期 of the PREVIOUS calendar year's academic year", () => {
    // The tail of a 上學期 that started the previous September.
    expect(semesterKeyForDate("2027-01-08")).toEqual({
      academicYear: 115,
      term: 1,
    })
  })

  it("flips to 下學期 on 1 February", () => {
    expect(semesterKeyForDate("2027-01-31")).toEqual({
      academicYear: 115,
      term: 1,
    })
    expect(semesterKeyForDate("2027-02-01")).toEqual({
      academicYear: 115,
      term: 2,
    })
  })

  it("keeps July in 下學期 of the same academic year", () => {
    expect(semesterKeyForDate("2027-07-15")).toEqual({
      academicYear: 115,
      term: 2,
    })
  })
})

describe("currentAcademicYear", () => {
  const semesters = [
    { academicYear: 113, startDate: "2024-09-01" },
    { academicYear: 114, startDate: "2025-09-01" },
    { academicYear: 115, startDate: "2026-09-01" },
  ]

  it("picks the latest semester that has already started", () => {
    expect(currentAcademicYear(semesters, "2026-01-15")).toBe(114)
  })

  it("falls back to the newest semester when none has started yet", () => {
    expect(currentAcademicYear(semesters, "2020-01-01")).toBe(115)
  })

  it("returns null for an empty semester list", () => {
    expect(currentAcademicYear([], "2026-01-15")).toBeNull()
  })
})
