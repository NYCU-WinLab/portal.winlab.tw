import { describe, expect, test } from "bun:test"

import {
  describeTagMerged,
  describeTagRenamed,
} from "@/lib/gallery/tag-admin-toast"

describe("describeTagRenamed", () => {
  test("wraps the new name", () => {
    expect(describeTagRenamed("demo-day")).toBe('Renamed to "demo-day"')
  })
})

describe("describeTagMerged", () => {
  test("singular link count", () => {
    expect(describeTagMerged({ name: "lab", movedCount: 1 })).toBe(
      'Merged into "lab" (1 link moved)'
    )
  })

  test("plural link count", () => {
    expect(describeTagMerged({ name: "lab", movedCount: 4 })).toBe(
      'Merged into "lab" (4 links moved)'
    )
  })
})
