import { describe, expect, test } from "bun:test"

import { describeSequenceZipSaved } from "@/lib/gallery/sequence-zip-result"

describe("describeSequenceZipSaved", () => {
  test("singular and plural", () => {
    expect(describeSequenceZipSaved(1)).toBe("Saved 1 shot as ZIP")
    expect(describeSequenceZipSaved(4)).toBe("Saved 4 shots as ZIP")
  })
})
