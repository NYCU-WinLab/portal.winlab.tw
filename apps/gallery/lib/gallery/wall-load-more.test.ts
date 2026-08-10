import { describe, expect, test } from "bun:test"

import { describeWallLoadMoreError } from "@/lib/gallery/wall-load-more"

describe("describeWallLoadMoreError", () => {
  test("uses Error.message when present", () => {
    expect(describeWallLoadMoreError(new Error("timeout"))).toBe("timeout")
  })

  test("falls back for unknown throws", () => {
    expect(describeWallLoadMoreError("nope")).toBe(
      "Failed to load more photos."
    )
  })
})
