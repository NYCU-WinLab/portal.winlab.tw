import { describe, expect, test } from "bun:test"

import { describeBulkTakenAtSet } from "@/lib/gallery/bulk-taken-at"

describe("describeBulkTakenAtSet", () => {
  test("singular and plural", () => {
    expect(describeBulkTakenAtSet(1)).toBe("Set capture date on 1 work.")
    expect(describeBulkTakenAtSet(4)).toBe("Set capture date on 4 works.")
  })

  test("zero uses plural form", () => {
    expect(describeBulkTakenAtSet(0)).toBe("Set capture date on 0 works.")
  })
})
