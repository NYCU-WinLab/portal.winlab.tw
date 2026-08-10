import { describe, expect, test } from "bun:test"

import { describeZipPreparingProgress } from "@/lib/gallery/zip-progress"

describe("describeZipPreparingProgress", () => {
  test("formats album and selection progress", () => {
    expect(
      describeZipPreparingProgress({
        completed: 0,
        total: 4,
        noun: "album",
      })
    ).toBe("Preparing album… 0/4")
    expect(
      describeZipPreparingProgress({
        completed: 2,
        total: 5,
        noun: "selection",
      })
    ).toBe("Preparing selection… 2/5")
  })
})
