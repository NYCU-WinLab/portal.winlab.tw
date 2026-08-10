import { describe, expect, test } from "bun:test"

import { describeHangUploadLabel } from "@/lib/gallery/hang-upload-label"

describe("describeHangUploadLabel", () => {
  test("single or empty selection", () => {
    expect(
      describeHangUploadLabel({ fileCount: 0, sequencesAvailable: true })
    ).toBe("Hang on the wall")
    expect(
      describeHangUploadLabel({ fileCount: 1, sequencesAvailable: false })
    ).toBe("Hang on the wall")
  })

  test("multi-file with sequences", () => {
    expect(
      describeHangUploadLabel({ fileCount: 4, sequencesAvailable: true })
    ).toBe("Hang sequence (4)")
  })

  test("multi-file without sequences", () => {
    expect(
      describeHangUploadLabel({ fileCount: 3, sequencesAvailable: false })
    ).toBe("Hang 3 shots")
  })
})
