import { describe, expect, test } from "bun:test"

import {
  clampGalleryMemoriesLimit,
  formatMemoriesDayLabel,
  galleryTaipeiCalendarDay,
  groupMemoriesByYear,
  isValidGalleryCalendarDay,
  memoriesYearsAgoLabel,
  resolveMemoriesCalendarDay,
  type GalleryMemoryPhoto,
} from "./memories"

function photo(
  partial: Partial<GalleryMemoryPhoto> &
    Pick<GalleryMemoryPhoto, "id" | "memory_year">
): GalleryMemoryPhoto {
  return {
    name: partial.name ?? partial.id,
    image_path: partial.image_path ?? `${partial.id}.jpg`,
    media_type: partial.media_type ?? "image",
    poster_path: partial.poster_path ?? null,
    created_by: partial.created_by ?? null,
    created_at: partial.created_at ?? "2024-01-01T00:00:00.000Z",
    taken_at: partial.taken_at ?? "2024-01-01T00:00:00.000Z",
    sequence_id: partial.sequence_id ?? null,
    sequence_index: partial.sequence_index ?? null,
    uploader_name: partial.uploader_name ?? "Lab",
    ...partial,
  }
}

describe("galleryTaipeiCalendarDay", () => {
  test("pins Aug 10 across the Taipei day boundary", () => {
    // 2026-08-09 16:00 UTC == 2026-08-10 00:00 Taipei
    const day = galleryTaipeiCalendarDay(new Date("2026-08-09T16:00:00.000Z"))
    expect(day).toEqual({ year: 2026, month: 8, day: 10 })
  })

  test("still Aug 9 just before Taipei midnight", () => {
    const day = galleryTaipeiCalendarDay(new Date("2026-08-09T15:59:00.000Z"))
    expect(day).toEqual({ year: 2026, month: 8, day: 9 })
  })
})

describe("isValidGalleryCalendarDay", () => {
  test("accepts Feb 29 and rejects Feb 30", () => {
    expect(isValidGalleryCalendarDay(2, 29)).toBe(true)
    expect(isValidGalleryCalendarDay(2, 30)).toBe(false)
  })

  test("rejects April 31 and month 0", () => {
    expect(isValidGalleryCalendarDay(4, 31)).toBe(false)
    expect(isValidGalleryCalendarDay(0, 10)).toBe(false)
  })
})

describe("resolveMemoriesCalendarDay", () => {
  test("falls back to today when query params are junk", () => {
    const now = new Date("2026-08-09T16:00:00.000Z")
    expect(
      resolveMemoriesCalendarDay({ month: "nope", day: "10", now })
    ).toEqual({ year: 2026, month: 8, day: 10 })
  })

  test("honours a valid month/day override", () => {
    const now = new Date("2026-08-09T16:00:00.000Z")
    expect(resolveMemoriesCalendarDay({ month: "12", day: "25", now })).toEqual(
      { year: 2026, month: 12, day: 25 }
    )
  })
})

describe("groupMemoriesByYear", () => {
  test("groups descending by year", () => {
    const groups = groupMemoriesByYear([
      photo({ id: "a", memory_year: 2023 }),
      photo({ id: "b", memory_year: 2025 }),
      photo({ id: "c", memory_year: 2023 }),
    ])
    expect(groups.map((g) => g.year)).toEqual([2025, 2023])
    expect(groups[1]!.photos.map((p) => p.id)).toEqual(["a", "c"])
  })
})

describe("clampGalleryMemoriesLimit", () => {
  test("clamps to the RPC bounds", () => {
    expect(clampGalleryMemoriesLimit(undefined)).toBe(100)
    expect(clampGalleryMemoriesLimit(0)).toBe(1)
    expect(clampGalleryMemoriesLimit(999)).toBe(200)
  })
})

describe("formatMemoriesDayLabel", () => {
  test("formats Aug 10 in English", () => {
    expect(formatMemoriesDayLabel(8, 10)).toBe("August 10")
  })

  test("formats Feb 29", () => {
    expect(formatMemoriesDayLabel(2, 29)).toBe("February 29")
  })
})

describe("memoriesYearsAgoLabel", () => {
  test("pluralises", () => {
    expect(memoriesYearsAgoLabel(2025, 2026)).toBe("1 year ago")
    expect(memoriesYearsAgoLabel(2023, 2026)).toBe("3 years ago")
  })
})
