import { describe, expect, test } from "bun:test"

import {
  describeArtworkNameUpdated,
  describeArtworkTitleUpdated,
  describeCaptureDateUpdated,
  describeSequenceUpdated,
} from "@/lib/gallery/manage-toast"

describe("manage toast helpers", () => {
  test("describeArtworkNameUpdated", () => {
    expect(describeArtworkNameUpdated()).toBe("Name updated")
  })

  test("describeArtworkTitleUpdated", () => {
    expect(describeArtworkTitleUpdated()).toBe("Title updated")
  })

  test("describeCaptureDateUpdated", () => {
    expect(describeCaptureDateUpdated()).toBe("Capture date updated")
  })

  test("describeSequenceUpdated", () => {
    expect(describeSequenceUpdated()).toBe("Sequence updated.")
  })
})
