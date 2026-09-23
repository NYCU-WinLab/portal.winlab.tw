import { describe, expect, test } from "bun:test"

import { announcementExcerpt } from "@/lib/mcp/tools/bulletin"

describe("announcementExcerpt", () => {
  test("returns short plain text unchanged", () => {
    expect(announcementExcerpt("Lab meeting moved to Friday.")).toBe(
      "Lab meeting moved to Friday."
    )
  })

  test("collapses newlines and runs of whitespace into single spaces", () => {
    expect(announcementExcerpt("first line\n\n  second   line\t")).toBe(
      "first line second line"
    )
  })

  test("strips headings, emphasis, quotes and list markers", () => {
    const md = "## Title\n\n> quoted\n\n- **bold** item\n- _italic_ item"
    expect(announcementExcerpt(md)).toBe("Title quoted bold item italic item")
  })

  test("keeps link text and drops the target", () => {
    expect(
      announcementExcerpt("see [the form](https://example.com/f) now")
    ).toBe("see the form now")
  })

  test("drops fenced code blocks and keeps inline code text", () => {
    expect(
      announcementExcerpt("run ```\nrm -rf /\n``` or `bun test` instead")
    ).toBe("run or bun test instead")
  })

  test("truncates to the limit and marks it with an ellipsis", () => {
    const excerpt = announcementExcerpt("a".repeat(500))
    expect(excerpt).toHaveLength(201)
    expect(excerpt.endsWith("…")).toBe(true)
  })

  test("honours a custom limit and never cuts mid-space", () => {
    expect(announcementExcerpt("one two three four", 8)).toBe("one two…")
  })

  test("survives an empty body", () => {
    expect(announcementExcerpt("")).toBe("")
  })
})
