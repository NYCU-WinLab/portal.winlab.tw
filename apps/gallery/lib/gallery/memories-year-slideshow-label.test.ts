import { describe, expect, test } from "bun:test"

import { describeMemoriesYearSlideshowAriaLabel } from "@/lib/gallery/memories-year-slideshow-label"

describe("describeMemoriesYearSlideshowAriaLabel", () => {
  test("names the year", () => {
    expect(describeMemoriesYearSlideshowAriaLabel(2022)).toBe(
      "Slideshow from 2022"
    )
  })
})
