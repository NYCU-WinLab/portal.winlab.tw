import { describe, expect, test } from "bun:test"

import { getQueensPuzzle, QUEENS_LEVEL_COUNT } from "@/lib/games/queens-puzzles"

// Size bands per the encoding header: 1-30 = 5x5, 31-60 = 6x6, 61-100 = 7x7.
function expectedSize(level: number): number {
  if (level <= 30) return 5
  if (level <= 60) return 6
  return 7
}

describe("getQueensPuzzle level count", () => {
  test("ships exactly 100 encoded puzzles", () => {
    expect(QUEENS_LEVEL_COUNT).toBe(100)
  })
})

describe("decoded shape + validity invariant (all levels)", () => {
  for (let level = 1; level <= QUEENS_LEVEL_COUNT; level++) {
    const size = expectedSize(level)

    test(`level ${level} is a valid ${size}x${size} puzzle`, () => {
      const puzzle = getQueensPuzzle(level)

      // level / size echoed straight from the encoded entry.
      expect(puzzle.level).toBe(level)
      expect(puzzle.size).toBe(size)

      // regions decode to a size x size row-major grid.
      expect(puzzle.regions.length).toBe(size)
      for (const row of puzzle.regions) {
        expect(row.length).toBe(size)
        for (const id of row) {
          expect(Number.isInteger(id)).toBe(true)
          expect(id).toBeGreaterThanOrEqual(0)
          expect(id).toBeLessThanOrEqual(size - 1)
        }
      }

      // queens: one column index per row, length === size.
      expect(puzzle.queens.length).toBe(size)

      const seenCols = new Set<number>()
      const seenRegions = new Set<number>()
      for (let r = 0; r < size; r++) {
        const col = puzzle.queens[r]!

        // column in range.
        expect(Number.isInteger(col)).toBe(true)
        expect(col).toBeGreaterThanOrEqual(0)
        expect(col).toBeLessThan(size)

        seenCols.add(col)
        seenRegions.add(puzzle.regions[r]![col]!)
      }

      // one queen per column: all distinct (rows already distinct by index).
      expect(seenCols.size).toBe(size)

      // one queen per region: the regions the queens land on are all distinct.
      expect(seenRegions.size).toBe(size)

      // region ids form a contiguous 0..size-1 set, so "one per region"
      // means every region is covered exactly once.
      const allRegionIds = new Set<number>()
      for (const row of puzzle.regions)
        for (const id of row) allRegionIds.add(id)
      expect(allRegionIds.size).toBe(size)
      expect([...allRegionIds].sort((a, b) => a - b)).toEqual(
        Array.from({ length: size }, (_, i) => i)
      )
    })
  }
})

describe("level clamping", () => {
  test("level 0 clamps up to level 1", () => {
    expect(getQueensPuzzle(0)).toEqual(getQueensPuzzle(1))
  })

  test("negative levels clamp up to level 1", () => {
    expect(getQueensPuzzle(-5)).toEqual(getQueensPuzzle(1))
  })

  test("levels above the max clamp down to the last level", () => {
    expect(getQueensPuzzle(QUEENS_LEVEL_COUNT + 1)).toEqual(
      getQueensPuzzle(QUEENS_LEVEL_COUNT)
    )
    expect(getQueensPuzzle(99999)).toEqual(getQueensPuzzle(QUEENS_LEVEL_COUNT))
  })

  test("fractional levels are truncated toward zero (| 0)", () => {
    expect(getQueensPuzzle(3.9)).toEqual(getQueensPuzzle(3))
    expect(getQueensPuzzle(1.1)).toEqual(getQueensPuzzle(1))
  })

  test("the last in-range level decodes the last encoded puzzle", () => {
    const last = getQueensPuzzle(QUEENS_LEVEL_COUNT)
    expect(last.level).toBe(QUEENS_LEVEL_COUNT)
    expect(last.size).toBe(7)
  })
})
