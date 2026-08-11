import { describe, expect, test } from "bun:test"

import { shareOrCopyPhotoLink } from "@/lib/gallery/photo-share"

describe("shareOrCopyPhotoLink", () => {
  test("copies when share is unavailable", async () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        clipboard: {
          writeText: async () => undefined,
        },
      },
    })
    try {
      const result = await shareOrCopyPhotoLink({
        url: "https://gallery.example/p",
        title: "Shot",
      })
      expect(result).toEqual({ ok: true, mode: "copied" })
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      })
    }
  })

  test("returns aborted when share is cancelled", async () => {
    const originalNavigator = globalThis.navigator
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        share: async () => {
          throw new DOMException("Abort", "AbortError")
        },
      },
    })
    try {
      const result = await shareOrCopyPhotoLink({
        url: "https://gallery.example/p",
        title: "Shot",
      })
      expect(result).toMatchObject({ ok: false, reason: "aborted" })
    } finally {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: originalNavigator,
      })
    }
  })
})
