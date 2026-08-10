import { describe, expect, test } from "bun:test"

import {
  describeCreatingLabel,
  describeRedirectingLabel,
  describeRetryingLabel,
  describeSavingLabel,
  describeSharingLabel,
  describeSigningOutLabel,
} from "@/lib/gallery/busy-labels"

describe("busy labels", () => {
  test("describeRetryingLabel", () => {
    expect(describeRetryingLabel()).toBe("Retrying…")
  })

  test("describeSigningOutLabel", () => {
    expect(describeSigningOutLabel()).toBe("Signing out…")
  })

  test("describeSavingLabel", () => {
    expect(describeSavingLabel()).toBe("Saving…")
  })

  test("describeCreatingLabel", () => {
    expect(describeCreatingLabel()).toBe("Creating…")
  })

  test("describeRedirectingLabel", () => {
    expect(describeRedirectingLabel()).toBe("Redirecting…")
  })

  test("describeSharingLabel", () => {
    expect(describeSharingLabel()).toBe("Sharing…")
  })
})
