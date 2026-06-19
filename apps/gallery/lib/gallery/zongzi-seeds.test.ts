import { describe, expect, test } from "bun:test"

import {
  makeZongziBurstParticles,
  pickPoppableZongzi,
  pickPoppableZongziCount,
  POPPABLE_ZONGZI_SPOTS,
  spawnPoppableZongzi,
  zongziSpotKey,
} from "@/lib/gallery/zongzi-seeds"

describe("pickPoppableZongzi", () => {
  test("count is always 2 or 3", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = pickPoppableZongziCount()
      expect(count === 2 || count === 3).toBe(true)
    }
  })

  test("returns unique spots", () => {
    const seeds = pickPoppableZongzi(3, () => 0.99)
    expect(seeds).toHaveLength(3)
    expect(new Set(seeds.map(zongziSpotKey)).size).toBe(3)
  })

  test("never returns more than the pool size", () => {
    expect(pickPoppableZongzi(99)).toHaveLength(POPPABLE_ZONGZI_SPOTS.length)
  })
})

describe("spawnPoppableZongzi", () => {
  test("avoids occupied spots", () => {
    const occupied = new Set([zongziSpotKey(POPPABLE_ZONGZI_SPOTS[0]!)])
    const next = spawnPoppableZongzi(occupied, () => 0)
    expect(next).not.toBeNull()
    expect(occupied.has(zongziSpotKey(next!))).toBe(false)
  })

  test("returns null when every spot is taken", () => {
    const occupied = new Set(POPPABLE_ZONGZI_SPOTS.map(zongziSpotKey))
    expect(spawnPoppableZongzi(occupied)).toBeNull()
  })
})

describe("makeZongziBurstParticles", () => {
  test("returns the requested particle count", () => {
    expect(makeZongziBurstParticles(8)).toHaveLength(8)
  })
})
