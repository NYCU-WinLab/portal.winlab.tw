import { describe, expect, test } from "bun:test"

import { formatTime } from "@/lib/games/constants"

describe("formatTime", () => {
  test("zero renders as seconds with padded centiseconds and trailing s", () => {
    expect(formatTime(0)).toBe("0.00s")
  })

  test("sub-second value renders centiseconds only", () => {
    expect(formatTime(50)).toBe("0.05s")
    expect(formatTime(990)).toBe("0.99s")
  })

  test("truncates to centiseconds (floor, no rounding)", () => {
    expect(formatTime(999)).toBe("0.99s")
    expect(formatTime(1009)).toBe("1.00s")
  })

  test("single-digit seconds are NOT zero-padded in the seconds branch", () => {
    expect(formatTime(5000)).toBe("5.00s")
    expect(formatTime(9990)).toBe("9.99s")
  })

  test("two-digit seconds under a minute stay in the seconds branch", () => {
    expect(formatTime(59000)).toBe("59.00s")
    expect(formatTime(59990)).toBe("59.99s")
  })

  test("crossing one minute switches to M:SS.CC format", () => {
    expect(formatTime(60000)).toBe("1:00.00")
  })

  test("minute branch zero-pads seconds to two digits", () => {
    expect(formatTime(65000)).toBe("1:05.00")
    expect(formatTime(65430)).toBe("1:05.43")
  })

  test("minute branch zero-pads centiseconds to two digits", () => {
    expect(formatTime(60050)).toBe("1:00.05")
  })

  test("multiple minutes are not zero-padded", () => {
    expect(formatTime(125000)).toBe("2:05.00")
    expect(formatTime(600000)).toBe("10:00.00")
  })

  test("seconds wrap correctly at minute boundaries", () => {
    expect(formatTime(119990)).toBe("1:59.99")
    expect(formatTime(3599990)).toBe("59:59.99")
  })

  test("centiseconds derive from the millisecond remainder, independent of seconds", () => {
    expect(formatTime(61120)).toBe("1:01.12")
  })
})
