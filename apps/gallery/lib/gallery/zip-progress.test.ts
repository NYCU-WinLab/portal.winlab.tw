import { describe, expect, test } from "bun:test"

import {
  describeZipBusyLabel,
  describeZipPreparingProgress,
} from "@/lib/gallery/zip-progress"

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

  test("formats story progress", () => {
    expect(
      describeZipPreparingProgress({
        completed: 1,
        total: 3,
        noun: "story",
      })
    ).toBe("Preparing story… 1/3")
  })
})

describe("describeZipBusyLabel", () => {
  test("returns the button busy label", () => {
    expect(describeZipBusyLabel()).toBe("Preparing ZIP…")
  })
})
