import { describe, expect, test } from "bun:test"

import {
  describeDeletingLabel,
  describeMediaHealthAllHealthy,
  describeMediaHealthDeleted,
  describeMediaHealthFoundBroken,
} from "@/lib/gallery/media-health-toast"

describe("describeMediaHealthAllHealthy", () => {
  test("singular and plural", () => {
    expect(describeMediaHealthAllHealthy(1)).toBe(
      "Scanned 1 shot — all healthy."
    )
    expect(describeMediaHealthAllHealthy(12)).toBe(
      "Scanned 12 shots — all healthy."
    )
  })
})

describe("describeMediaHealthFoundBroken", () => {
  test("singular and plural broken counts", () => {
    expect(describeMediaHealthFoundBroken({ broken: 1, scanned: 40 })).toBe(
      "Found 1 broken shot across 40."
    )
    expect(describeMediaHealthFoundBroken({ broken: 3, scanned: 40 })).toBe(
      "Found 3 broken shots across 40."
    )
  })
})

describe("describeMediaHealthDeleted", () => {
  test("singular and plural", () => {
    expect(describeMediaHealthDeleted(1)).toBe(
      "Removed 1 broken shot from the wall."
    )
    expect(describeMediaHealthDeleted(2)).toBe(
      "Removed 2 broken shots from the wall."
    )
  })
})

describe("describeDeletingLabel", () => {
  test("returns the busy delete label", () => {
    expect(describeDeletingLabel()).toBe("Deleting…")
  })
})
