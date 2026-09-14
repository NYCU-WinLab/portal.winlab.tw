import { describe, expect, it } from "bun:test"

import {
  currentAcademicYear,
  semesterKeyForDate,
  semesterWindow,
} from "./semester"

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
  it("returns the academic year today's date falls in", () => {
    expect(currentAcademicYear("2026-01-15")).toBe(114)
  })

  it("crosses into the next academic year on 1 August", () => {
    expect(currentAcademicYear("2026-08-01")).toBe(115)
  })
})

describe("semesterWindow", () => {
  it("runs 上學期 from 8/1 to the following 1/31", () => {
    expect(semesterWindow("2026-08-01")).toEqual({
      start: "2026-08-01",
      end: "2027-01-31",
    })
  })

  it("keeps January inside the PREVIOUS year's 上學期", () => {
    expect(semesterWindow("2027-01-04")).toEqual({
      start: "2026-08-01",
      end: "2027-01-31",
    })
  })

  it("opens 下學期 on 2/1 and closes it on 7/31", () => {
    expect(semesterWindow("2027-02-01")).toEqual({
      start: "2027-02-01",
      end: "2027-07-31",
    })
  })

  it("puts 1/31 and 2/1 in different semesters", () => {
    expect(semesterWindow("2027-01-31").end).toBe("2027-01-31")
    expect(semesterWindow("2027-02-01").start).toBe("2027-02-01")
  })

  it("puts 7/31 and 8/1 in different semesters", () => {
    expect(semesterWindow("2026-07-31").end).toBe("2026-07-31")
    expect(semesterWindow("2026-08-01").start).toBe("2026-08-01")
  })
})
