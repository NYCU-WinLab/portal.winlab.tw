import { describe, expect, test } from "bun:test"

import {
  isGalleryMemoriesReady,
  isGalleryMemoriesUnavailable,
} from "@/lib/gallery/load-memories"

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

describe("isGalleryMemoriesReady", () => {
  test("is false when the memories RPC is missing", async () => {
    const client = {
      rpc() {
        return Promise.resolve({
          error: {
            code: "PGRST202",
            message: "Could not find the function gallery_memories_on_this_day",
          },
        })
      },
    } as never
    expect(await isGalleryMemoriesReady(client)).toBe(false)
  })

  test("is true when the RPC succeeds", async () => {
    const client = {
      rpc() {
        return Promise.resolve({ data: [], error: null })
      },
    } as never
    expect(await isGalleryMemoriesReady(client)).toBe(true)
  })
})
