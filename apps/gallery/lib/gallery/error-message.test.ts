import { describe, expect, test } from "bun:test"

import { describeErrorMessage } from "@/lib/gallery/error-message"

describe("describeErrorMessage", () => {
  test("returns Error.message when present", () => {
    expect(describeErrorMessage(new Error("boom"), "fallback")).toBe("boom")
  })

  test("returns fallback for non-Error throws", () => {
    expect(describeErrorMessage("nope", "fallback")).toBe("fallback")
    expect(describeErrorMessage(null, "fallback")).toBe("fallback")
  })
})
