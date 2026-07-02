import { describe, expect, test } from "bun:test"

import {
  formatOrderDate,
  orderBatchSuffix,
  parseOrderDate,
} from "@/lib/bento/date"

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

describe("formatOrderDate", () => {
  test("formats a Postgres date column into YYYY/MM/DD", () => {
    expect(formatOrderDate("2026-07-02", "20260702")).toBe("2026/07/02")
  })

  test("falls back to parsing the id when order_date is missing", () => {
    expect(formatOrderDate(null, "20260702")).toBe("2026/07/02")
    expect(formatOrderDate(undefined, "20260702-2")).toBe("20260702-2")
  })

  test("prefers the date column even for suffixed ids", () => {
    expect(formatOrderDate("2026-07-02", "20260702-3")).toBe("2026/07/02")
  })
})

describe("orderBatchSuffix", () => {
  test("returns null for the first order of a day", () => {
    expect(orderBatchSuffix("20260702")).toBeNull()
  })

  test("returns the batch number for later orders", () => {
    expect(orderBatchSuffix("20260702-2")).toBe("2")
    expect(orderBatchSuffix("20260702-10")).toBe("10")
  })

  test("returns null for non-date ids", () => {
    expect(orderBatchSuffix("abc")).toBeNull()
  })
})
