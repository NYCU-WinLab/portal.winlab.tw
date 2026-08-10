import { describe, expect, test } from "bun:test"

import {
  describeCancelUploadLabel,
  describeContinueWithKeycloakLabel,
  describeCreatingLabel,
  describeDevelopingLabel,
  describeInstallingLabel,
  describeLoadingTagsLabel,
  describeMergingLabel,
  describeRedirectingLabel,
  describeRetryingLabel,
  describeSavingLabel,
  describeScanningLabel,
  describeSharingLabel,
  describeSignOutLabel,
  describeSigningOutLabel,
  describeTaggingLabel,
  describeUntaggingLabel,
  describeWorkingLabel,
} from "@/lib/gallery/busy-labels"

describe("busy labels", () => {
  test("describeRetryingLabel", () => {
    expect(describeRetryingLabel()).toBe("Retrying…")
  })

  test("describeSigningOutLabel", () => {
    expect(describeSigningOutLabel()).toBe("Signing out…")
  })

  test("describeSignOutLabel", () => {
    expect(describeSignOutLabel()).toBe("Sign out")
  })

  test("describeContinueWithKeycloakLabel", () => {
    expect(describeContinueWithKeycloakLabel()).toBe("Continue with Keycloak")
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

  test("describeMergingLabel", () => {
    expect(describeMergingLabel()).toBe("Merging…")
  })

  test("describeTaggingLabel", () => {
    expect(describeTaggingLabel()).toBe("Tagging…")
  })

  test("describeUntaggingLabel", () => {
    expect(describeUntaggingLabel()).toBe("Untagging…")
  })

  test("describeScanningLabel", () => {
    expect(describeScanningLabel()).toBe("Scanning…")
  })

  test("describeInstallingLabel", () => {
    expect(describeInstallingLabel()).toBe("Installing…")
  })

  test("describeWorkingLabel", () => {
    expect(describeWorkingLabel()).toBe("Working…")
  })

  test("describeDevelopingLabel", () => {
    expect(describeDevelopingLabel()).toBe("Developing…")
  })

  test("describeLoadingTagsLabel", () => {
    expect(describeLoadingTagsLabel()).toBe("Loading tags…")
  })

  test("describeCancelUploadLabel", () => {
    expect(describeCancelUploadLabel()).toBe("Cancel upload")
  })
})
