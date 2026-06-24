import { describe, expect, test } from "bun:test"

import {
  makeFootballKickParticles,
  makeFootballKickVector,
  pickPoppableFootballs,
  pickPoppableFootballCount,
  spawnPoppableFootball,
  footballSpotKey,
} from "@/lib/gallery/football-seeds"
import { POPPABLE_ZONGZI_SPOTS } from "@/lib/gallery/zongzi-seeds"

describe("pickPoppableFootballs", () => {
  test("count is always 2 or 3", () => {
    for (let i = 0; i < 20; i += 1) {
      const count = pickPoppableFootballCount()
      expect(count === 2 || count === 3).toBe(true)
    }
  })

  test("returns unique spots", () => {
    const seeds = pickPoppableFootballs(3, () => 0.99)
    expect(seeds).toHaveLength(3)
    expect(new Set(seeds.map(footballSpotKey)).size).toBe(3)
  })

  test("never returns more than the pool size", () => {
    expect(pickPoppableFootballs(99)).toHaveLength(POPPABLE_ZONGZI_SPOTS.length)
  })
})

describe("spawnPoppableFootball", () => {
  test("avoids occupied spots", () => {
    const occupied = new Set([footballSpotKey(POPPABLE_ZONGZI_SPOTS[0]!)])
    const next = spawnPoppableFootball(occupied, () => 0)
    expect(next).not.toBeNull()
    expect(occupied.has(footballSpotKey(next!))).toBe(false)
  })

  test("returns null when every spot is taken", () => {
    const occupied = new Set(POPPABLE_ZONGZI_SPOTS.map(footballSpotKey))
    expect(spawnPoppableFootball(occupied)).toBeNull()
  })
})

describe("makeFootballKickVector", () => {
  test("returns non-zero displacement", () => {
    const kick = makeFootballKickVector(() => 0.25)
    expect(Math.abs(kick.tx) + Math.abs(kick.ty)).toBeGreaterThan(0)
  })
})

describe("makeFootballKickParticles", () => {
  test("returns emoji-only particles", () => {
    const particles = makeFootballKickParticles(6)
    expect(particles).toHaveLength(6)
    expect(particles.every((particle) => particle.glyph === "emoji")).toBe(true)
  })
})
