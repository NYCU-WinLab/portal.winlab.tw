import { describe, expect, test } from "bun:test"

import {
  describeDismissOfflineLabel,
  describeOfflineBannerDescription,
  describeOfflineBannerTitle,
} from "@/lib/gallery/offline-banner-labels"

describe("offline banner labels", () => {
  test("title, description, and dismiss", () => {
    expect(describeOfflineBannerTitle()).toContain("offline")
    expect(describeOfflineBannerDescription().length).toBeGreaterThan(20)
    expect(describeDismissOfflineLabel()).toBe("Dismiss")
  })
})
