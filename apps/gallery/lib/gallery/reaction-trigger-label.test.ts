import { describe, expect, test } from "bun:test"

import { describeReactTriggerAriaLabel } from "@/lib/gallery/reaction-trigger-label"

describe("describeReactTriggerAriaLabel", () => {
  test("signed reaction mentions the emoji and keyboard open", () => {
    expect(describeReactTriggerAriaLabel("👍")).toContain("👍")
    expect(describeReactTriggerAriaLabel("👍")).toContain("ArrowUp")
  })

  test("unsigned reaction prompts ArrowUp open", () => {
    expect(describeReactTriggerAriaLabel(null)).toBe(
      "React. ArrowUp or Alt+Enter for more"
    )
  })
})
