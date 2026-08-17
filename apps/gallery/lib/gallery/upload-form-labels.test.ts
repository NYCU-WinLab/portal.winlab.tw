import { describe, expect, test } from "bun:test"

import {
  describeUntitledLabMomentPlaceholder,
  describeUploadTagsPlaceholder,
} from "@/lib/gallery/upload-form-labels"

describe("upload form labels", () => {
  test("placeholders", () => {
    expect(describeUntitledLabMomentPlaceholder()).toBe("Untitled lab moment")
    expect(describeUploadTagsPlaceholder()).toBe("lab trip, sunset")
  })
})
