import { describe, expect, test } from "bun:test"

import { mapLimited } from "@/lib/groups/batch"

const tick = () => new Promise((r) => setTimeout(r, 1))

describe("mapLimited", () => {
  test("keeps input order and never runs more than the limit at once", async () => {
    let running = 0
    let peak = 0
    const out = await mapLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
      running++
      peak = Math.max(peak, running)
      await tick()
      running--
      return n * 10
    })
    expect(out).toEqual([10, 20, 30, 40, 50, 60])
    expect(peak).toBe(2)
  })

  test("once stop() is true no new item starts; started ones finish", async () => {
    let stopped = false
    const started: number[] = []
    const out = await mapLimited(
      [1, 2, 3, 4, 5],
      1,
      async (n) => {
        started.push(n)
        if (n === 2) stopped = true
        await tick()
        return n
      },
      () => stopped
    )
    expect(started).toEqual([1, 2])
    expect(out).toEqual([1, 2])
  })

  test("an empty list does nothing", async () => {
    expect(await mapLimited([], 4, async (n: number) => n)).toEqual([])
  })
})
