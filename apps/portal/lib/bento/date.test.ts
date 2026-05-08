import { describe, expect, test } from "bun:test"

import { parseOrderDate } from "@/lib/bento/date"

describe("parseOrderDate", () => {
  test("formats an 8-digit YYYYMMDD into YYYY/MM/DD", () => {
    expect(parseOrderDate("20240715")).toBe("2024/07/15")
  })

  test("returns the original string when it is not 8 digits", () => {
    expect(parseOrderDate("2024-07-15")).toBe("2024-07-15")
    expect(parseOrderDate("2024715")).toBe("2024715")
    expect(parseOrderDate("abcd1234")).toBe("abcd1234")
  })

  test("treats empty or short input as a passthrough", () => {
    expect(parseOrderDate("")).toBe("")
    expect(parseOrderDate("123")).toBe("123")
  })
})
