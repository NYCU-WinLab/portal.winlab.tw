import { describe, expect, test } from "bun:test"

import {
  describeRetryingLabel,
  describeSigningOutLabel,
} from "@/lib/gallery/busy-labels"

describe("describeRetryingLabel", () => {
  test("returns the retry busy label", () => {
    expect(describeRetryingLabel()).toBe("Retrying…")
  })
})

describe("describeSigningOutLabel", () => {
  test("returns the sign-out busy label", () => {
    expect(describeSigningOutLabel()).toBe("Signing out…")
  })
})
