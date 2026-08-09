import { describe, expect, test } from "bun:test"

import { resolveLightboxShortcut } from "@/lib/gallery/lightbox-shortcuts"

describe("resolveLightboxShortcut", () => {
  test("maps navigation and social keys", () => {
    expect(resolveLightboxShortcut("ArrowLeft")).toBe("prev")
    expect(resolveLightboxShortcut("ArrowRight")).toBe("next")
    expect(resolveLightboxShortcut("i")).toBe("toggle-details")
    expect(resolveLightboxShortcut("S")).toBe("share")
    expect(resolveLightboxShortcut("f")).toBe("favorite")
    expect(resolveLightboxShortcut("D")).toBe("download")
  })

  test("ignores modified keys and unknowns", () => {
    expect(resolveLightboxShortcut("f", { metaKey: true })).toBeNull()
    expect(resolveLightboxShortcut("f", { ctrlKey: true })).toBeNull()
    expect(resolveLightboxShortcut("Escape")).toBeNull()
    expect(resolveLightboxShortcut("x")).toBeNull()
  })
})
