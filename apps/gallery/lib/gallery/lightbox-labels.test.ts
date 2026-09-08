import { describe, expect, test } from "bun:test"

import {
  describeLightboxCloseAriaLabel,
  describeLightboxNextAriaLabel,
  describeLightboxPreviousAriaLabel,
  describeLightboxShareAriaLabel,
} from "@/lib/gallery/lightbox-labels"

describe("lightbox labels", () => {
  test("chrome aria-labels", () => {
    expect(describeLightboxCloseAriaLabel()).toBe("Close")
    expect(describeLightboxShareAriaLabel()).toBe("Share")
    expect(describeLightboxPreviousAriaLabel()).toBe("Previous")
    expect(describeLightboxNextAriaLabel()).toBe("Next")
  })
})
