import { describe, expect, test } from "bun:test"

import { formatCompressError } from "@/lib/gallery/video-compress"

describe("formatCompressError", () => {
  test("maps Failed to fetch to a CDN / encoder hint", () => {
    const message = formatCompressError(new TypeError("Failed to fetch"))
    expect(message.toLowerCase()).toContain("encoder")
    expect(message.toLowerCase()).toContain("cdn")
  })

  test("keeps unrelated messages", () => {
    expect(formatCompressError(new Error("unexpected ffmpeg output"))).toBe(
      "unexpected ffmpeg output"
    )
  })
})
