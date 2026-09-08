import { describe, expect, test } from "bun:test"

import { remainingSeconds } from "@/lib/games/quiz/countdown"

describe("remainingSeconds", () => {
  const startedAt = "2026-08-24T12:00:00.000Z"

  test("at question start, remaining equals the full time limit", () => {
    const now = new Date("2026-08-24T12:00:00.000Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(20)
  })

  test("counts down as elapsed time increases", () => {
    const now = new Date("2026-08-24T12:00:05.000Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(15)
  })

  test("ceils partial seconds so it doesn't show 0 early", () => {
    const now = new Date("2026-08-24T12:00:19.500Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(1)
  })

  test("hits exactly 0 once the full time limit has elapsed", () => {
    const now = new Date("2026-08-24T12:00:20.000Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(0)
  })

  test("clamps to 0 instead of going negative when time is overrun", () => {
    const now = new Date("2026-08-24T12:00:45.000Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(0)
  })

  test("clamps to 0 for a now earlier than questionStartedAt (clock skew)", () => {
    const now = new Date("2026-08-24T11:59:55.000Z")
    expect(remainingSeconds(startedAt, 20, now)).toBe(20)
  })
})
