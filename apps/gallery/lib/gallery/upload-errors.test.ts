import { describe, expect, test } from "bun:test"

import {
  UploadFailureError,
  describeUploadFailure,
  userMessageForStage,
} from "@/lib/gallery/upload-errors"

describe("describeUploadFailure", () => {
  test("preserves UploadFailureError stage and message", () => {
    const err = new UploadFailureError(
      "storage-verify",
      "verify upload timed out",
      "Still syncing."
    )
    expect(describeUploadFailure(err)).toEqual({
      detail: "verify upload timed out",
      stage: "storage-verify",
      userMessage: "Still syncing.",
    })
  })

  test("classifies abort, type, verify, db, video, network, size", () => {
    expect(describeUploadFailure(new Error("Upload cancelled"))).toMatchObject({
      stage: "aborted",
    })
    expect(
      describeUploadFailure(new Error("Unsupported media type"))
    ).toMatchObject({ stage: "type" })
    expect(
      describeUploadFailure(new Error("verify upload failed"))
    ).toMatchObject({ stage: "storage-verify" })
    expect(
      describeUploadFailure(new Error("Database insert failed: boom"))
    ).toMatchObject({ stage: "db-insert" })
    expect(
      describeUploadFailure(new Error("ffmpeg encoder CDN blocked"))
    ).toMatchObject({ stage: "video-processing" })
    expect(describeUploadFailure(new Error("Failed to fetch"))).toMatchObject({
      stage: "network",
    })
    expect(describeUploadFailure(new Error("Payload too large"))).toMatchObject(
      { stage: "storage-upload" }
    )
    expect(
      describeUploadFailure(new Error("storage bucket rejected upload"))
    ).toMatchObject({ stage: "storage-upload" })
  })
})

describe("userMessageForStage", () => {
  test("surfaces CDN-blocked video copy", () => {
    expect(
      userMessageForStage(
        "video-processing",
        "encoder CDN blocked by ad blocker"
      )
    ).toContain("encoder CDN blocked")
  })

  test("includes short detail for storage upload", () => {
    const msg = userMessageForStage("storage-upload", "permission denied")
    expect(msg).toContain("permission denied")
    expect(msg).toContain("retry")
  })
})
