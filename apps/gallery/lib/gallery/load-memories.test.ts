import { describe, expect, test } from "bun:test"

import { isGalleryMemoriesUnavailable } from "@/lib/gallery/load-memories"

describe("isGalleryMemoriesUnavailable", () => {
  test("detects missing RPC / relation", () => {
    expect(isGalleryMemoriesUnavailable(null)).toBe(false)
    expect(
      isGalleryMemoriesUnavailable({
        code: "PGRST202",
        message: "Could not find the function",
      })
    ).toBe(true)
    expect(
      isGalleryMemoriesUnavailable({
        message: "function gallery_memories_on_this_day does not exist",
      })
    ).toBe(true)
    expect(
      isGalleryMemoriesUnavailable({
        message: "permission denied for function gallery_memories_on_this_day",
      })
    ).toBe(false)
  })
})
