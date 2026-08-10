import { describe, expect, test } from "bun:test"

import { describePinToast } from "@/lib/gallery/pin-toast"

describe("describePinToast", () => {
  test("pin and unpin copy", () => {
    expect(describePinToast(true)).toBe("Pinned to wall top.")
    expect(describePinToast(false)).toBe("Unpinned.")
  })
})
