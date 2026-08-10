import { describe, expect, test } from "bun:test"

import {
  describeCouldNotLoadTags,
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

describe("describeCouldNotLoadTags", () => {
  test("prefixes the load error", () => {
    expect(describeCouldNotLoadTags("network down")).toBe(
      "Could not load tags — network down"
    )
  })

  test("keeps an empty suffix", () => {
    expect(describeCouldNotLoadTags("")).toBe("Could not load tags — ")
  })
})
