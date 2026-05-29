import { describe, expect, test } from "bun:test"

import { cn } from "./utils"

describe("cn", () => {
  test("merges conflicting tailwind classes, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })

  test("drops falsy values and keeps the rest", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c")
  })
})
