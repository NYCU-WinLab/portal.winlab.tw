import { describe, expect, test } from "bun:test"

import {
  ARTWORK_NAME_MAX,
  buildArtworkName,
  inferArtworkName,
  sanitizeArtworkName,
} from "@/lib/gallery/upload-naming"

describe("sanitizeArtworkName", () => {
  test("trims, collapses whitespace, and drops control chars", () => {
    expect(sanitizeArtworkName("  hello\n\tworld\u0000  ")).toBe("hello world")
  })

  test("falls back to Untitled when empty", () => {
    expect(sanitizeArtworkName("   ")).toBe("Untitled")
    expect(sanitizeArtworkName("\u0000")).toBe("Untitled")
  })

  test("clamps to ARTWORK_NAME_MAX", () => {
    const long = "a".repeat(ARTWORK_NAME_MAX + 20)
    expect(sanitizeArtworkName(long).length).toBe(ARTWORK_NAME_MAX)
  })
})

describe("inferArtworkName", () => {
  test("strips the extension", () => {
    expect(inferArtworkName("lab-retreat.JPG")).toBe("lab-retreat")
  })
})

describe("buildArtworkName", () => {
  test("single file uses base or inferred stem", () => {
    expect(buildArtworkName([{ name: "a.jpg" }], "Cover", 0)).toBe("Cover")
    expect(buildArtworkName([{ name: "shot.png" }], "", 0)).toBe("shot")
  })

  test("sequence appends index after the cover", () => {
    const files = [{ name: "a.jpg" }, { name: "b.jpg" }, { name: "c.jpg" }]
    expect(buildArtworkName(files, "Trip", 0)).toBe("Trip")
    expect(buildArtworkName(files, "Trip", 1)).toBe("Trip1")
    expect(buildArtworkName(files, "Trip", 2)).toBe("Trip2")
  })

  test("sequence without base uses each file stem", () => {
    const files = [{ name: "a.jpg" }, { name: "b.jpg" }]
    expect(buildArtworkName(files, "", 1)).toBe("b")
  })
})
