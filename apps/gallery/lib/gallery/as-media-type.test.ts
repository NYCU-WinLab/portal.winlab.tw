import { describe, expect, test } from "bun:test"

import { asMediaType } from "@/lib/gallery/load-albums"

describe("asMediaType", () => {
  test("accepts image and video", () => {
    expect(asMediaType("image")).toBe("image")
    expect(asMediaType("video")).toBe("video")
  })

  test("rejects null and other strings", () => {
    expect(asMediaType(null)).toBeNull()
    expect(asMediaType("")).toBeNull()
    expect(asMediaType("audio")).toBeNull()
    expect(asMediaType("IMAGE")).toBeNull()
  })
})
