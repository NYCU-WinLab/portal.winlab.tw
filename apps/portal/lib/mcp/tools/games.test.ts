import { describe, expect, test } from "bun:test"

import type { GameScore } from "@/lib/games/types"
import { leaderboardRows } from "@/lib/mcp/tools/games"

const scores: GameScore[] = [
  {
    user_id: "11111111-1111-1111-1111-111111111111",
    user_name: "First",
    score: 2048,
    finish_time_ms: 61_230,
    achieved_at: "2026-09-20T10:00:00.000Z",
  },
  {
    user_id: "22222222-2222-2222-2222-222222222222",
    user_name: "Second",
    score: 1024,
    finish_time_ms: 9_500,
    achieved_at: "2026-09-19T10:00:00.000Z",
  },
]

describe("leaderboardRows", () => {
  test("ranks by the order the RPC returned", () => {
    expect(leaderboardRows("2048", scores).map((r) => r.rank)).toEqual([1, 2])
  })

  test("labels the score and the finish time per game", () => {
    const [row] = leaderboardRows("snake", [scores[1]!])
    expect(row?.score_label).toBe("1024 分")
    expect(row?.finish_time_label).toBe("9.50s")
  })

  test("labels typing scores as WPM", () => {
    const [row] = leaderboardRows("typing", [scores[0]!])
    expect(row?.score_label).toBe("205 WPM")
    expect(row?.finish_time_label).toBe("1:01.23")
  })

  test("maps an empty board to an empty list", () => {
    expect(leaderboardRows("memory", [])).toEqual([])
  })
})
