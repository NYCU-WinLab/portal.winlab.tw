import { describe, expect, test } from "bun:test"

import { mapPool } from "@/lib/gallery/map-pool"

describe("mapPool", () => {
  test("maps every item in order", async () => {
    const out = await mapPool([1, 2, 3, 4], 2, async (n) => n * 10)
    expect(out).toEqual([10, 20, 30, 40])
  })

  test("honors concurrency without dropping work", async () => {
    let live = 0
    let peak = 0
    const out = await mapPool(
      Array.from({ length: 8 }, (_, i) => i),
      3,
      async (n) => {
        live += 1
        peak = Math.max(peak, live)
        await Promise.resolve()
        live -= 1
        return n
      }
    )
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(peak).toBeLessThanOrEqual(3)
  })

  test("returns empty for empty input", async () => {
    expect(await mapPool([], 4, async (n) => n)).toEqual([])
  })
})
