import { describe, expect, test } from "bun:test"

import {
  describePinChromeLabel,
  describePinLabel,
  describePinToast,
  describeUnpinLabel,
} from "@/lib/gallery/pin-toast"

describe("describePinToast", () => {
  test("pinned and unpinned", () => {
    expect(describePinToast(true)).toBe("Pinned to wall top.")
    expect(describePinToast(false)).toBe("Unpinned.")
  })
})

describe("pin chrome labels", () => {
  test("pin unpin chrome", () => {
    expect(describePinLabel()).toBe("Pin")
    expect(describeUnpinLabel()).toBe("Unpin")
    expect(describePinChromeLabel(false)).toBe("Pin")
    expect(describePinChromeLabel(true)).toBe("Unpin")
  })
})
