import { describe, expect, test } from "bun:test"

import { describeArtworkDeleted } from "@/lib/gallery/delete-toast"

describe("describeArtworkDeleted", () => {
  test("wraps the artwork name", () => {
    expect(describeArtworkDeleted("Lab dinner")).toBe('Deleted "Lab dinner"')
  })
})
