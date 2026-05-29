import { describe, expect, test } from "bun:test"

import {
  BOTTOM,
  getConnected,
  getEndpoints,
  getPuzzle,
  LEFT,
  PIPES_GRID,
  PIPES_LEVEL_COUNT,
  rotateCW,
  RIGHT,
  TOP,
} from "@/lib/games/pipes-puzzle"

describe("direction bit constants", () => {
  test("TOP/RIGHT/BOTTOM/LEFT are the four single bits in CW order", () => {
    expect([TOP, RIGHT, BOTTOM, LEFT]).toEqual([1, 2, 4, 8])
  })

  test("grid is 6x6 with 100 levels", () => {
    expect(PIPES_GRID).toBe(6)
    expect(PIPES_LEVEL_COUNT).toBe(100)
  })
})

describe("rotateCW", () => {
  test("rotates one bit clockwise by default (times = 1)", () => {
    // The mask layout is a 4-bit ring TOP(1)->RIGHT(2)->BOTTOM(4)->LEFT(8).
    // A clockwise rotation is therefore a left shift within those 4 bits.
    expect(rotateCW(TOP)).toBe(RIGHT)
    expect(rotateCW(RIGHT)).toBe(BOTTOM)
    expect(rotateCW(BOTTOM)).toBe(LEFT)
  })

  test("wraps LEFT back to TOP (the high bit feeds the low bit)", () => {
    expect(rotateCW(LEFT)).toBe(TOP)
  })

  test("explicit times rotates that many steps", () => {
    expect(rotateCW(TOP, 1)).toBe(RIGHT)
    expect(rotateCW(TOP, 2)).toBe(BOTTOM)
    expect(rotateCW(TOP, 3)).toBe(LEFT)
  })

  test("rotates compound masks as a whole ring", () => {
    // TOP|RIGHT (an elbow) rotated once becomes RIGHT|BOTTOM.
    expect(rotateCW(TOP | RIGHT)).toBe(RIGHT | BOTTOM)
    // TOP|BOTTOM (a straight) rotated once becomes RIGHT|LEFT.
    expect(rotateCW(TOP | BOTTOM)).toBe(RIGHT | LEFT)
    // A straight pipe has period 2 under rotation.
    expect(rotateCW(TOP | BOTTOM, 2)).toBe(TOP | BOTTOM)
  })

  test("is a 4-bit rotation: rotateCW(m, 4) === m for every mask 0..15", () => {
    for (let m = 0; m <= 0xf; m++) {
      expect(rotateCW(m, 4)).toBe(m)
    }
  })

  test("rotateCW(m, 8) === m (two full turns) for every mask", () => {
    for (let m = 0; m <= 0xf; m++) {
      expect(rotateCW(m, 8)).toBe(m)
    }
  })

  test("never leaves the low 4 bits", () => {
    for (let m = 0; m <= 0xf; m++) {
      for (let t = 0; t < 4; t++) {
        expect(rotateCW(m, t)).toBeLessThanOrEqual(0xf)
        expect(rotateCW(m, t)).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

describe("getPuzzle determinism", () => {
  test("same level produces a deep-equal puzzle every time", () => {
    expect(getPuzzle(1)).toEqual(getPuzzle(1))
    expect(getPuzzle(42)).toEqual(getPuzzle(42))
    expect(getPuzzle(PIPES_LEVEL_COUNT)).toEqual(getPuzzle(PIPES_LEVEL_COUNT))
  })

  test("different levels generally produce different scrambled grids", () => {
    const a = getPuzzle(1)
    const b = getPuzzle(2)
    expect(a.scrambled).not.toEqual(b.scrambled)
  })
})

describe("getPuzzle level clamping", () => {
  test("clamps levels below 1 up to 1", () => {
    expect(getPuzzle(0).level).toBe(1)
    expect(getPuzzle(-3).level).toBe(1)
    expect(getPuzzle(-9999).level).toBe(1)
  })

  test("clamps levels above the count down to the max", () => {
    expect(getPuzzle(101).level).toBe(PIPES_LEVEL_COUNT)
    expect(getPuzzle(999).level).toBe(PIPES_LEVEL_COUNT)
  })

  test("keeps in-range levels untouched", () => {
    expect(getPuzzle(1).level).toBe(1)
    expect(getPuzzle(50).level).toBe(50)
    expect(getPuzzle(PIPES_LEVEL_COUNT).level).toBe(PIPES_LEVEL_COUNT)
  })

  test("truncates fractional levels toward zero (| 0)", () => {
    expect(getPuzzle(3.9).level).toBe(3)
    expect(getPuzzle(1.999).level).toBe(1)
  })

  test("an out-of-range level is equivalent to its clamped level", () => {
    expect(getPuzzle(0)).toEqual(getPuzzle(1))
    expect(getPuzzle(150)).toEqual(getPuzzle(PIPES_LEVEL_COUNT))
  })
})

describe("getPuzzle shape", () => {
  test("source is the grid center and size is PIPES_GRID", () => {
    const center = Math.floor(PIPES_GRID / 2)
    const p = getPuzzle(1)
    expect(p.size).toBe(PIPES_GRID)
    expect(p.source).toEqual([center, center])
  })

  test("solved and scrambled are square grids of size PIPES_GRID", () => {
    const p = getPuzzle(13)
    expect(p.solved).toHaveLength(PIPES_GRID)
    expect(p.scrambled).toHaveLength(PIPES_GRID)
    for (const row of p.solved) expect(row).toHaveLength(PIPES_GRID)
    for (const row of p.scrambled) expect(row).toHaveLength(PIPES_GRID)
  })
})

describe("solved grid invariants", () => {
  test("every solved grid is a fully connected spanning tree from the source", () => {
    for (let lv = 1; lv <= PIPES_LEVEL_COUNT; lv++) {
      const p = getPuzzle(lv)
      const reached = getConnected(p.solved, p.source, p.size, p.size)
      expect(reached.size).toBe(p.size * p.size)
    }
  })

  test("no solved cell is empty (the tree touches every cell)", () => {
    for (let lv = 1; lv <= PIPES_LEVEL_COUNT; lv++) {
      const p = getPuzzle(lv)
      for (const row of p.solved) {
        for (const mask of row) {
          expect(mask).toBeGreaterThan(0)
          expect(mask).toBeLessThanOrEqual(0xf)
        }
      }
    }
  })

  test("connections are symmetric: a cell pointing at a neighbor is pointed back", () => {
    const p = getPuzzle(23)
    const { solved, size } = p
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const m = solved[r]![c]!
        if (m & TOP) expect(solved[r - 1]?.[c]! & BOTTOM).toBeTruthy()
        if (m & BOTTOM) expect(solved[r + 1]?.[c]! & TOP).toBeTruthy()
        if (m & LEFT) expect(solved[r]![c - 1]! & RIGHT).toBeTruthy()
        if (m & RIGHT) expect(solved[r]![c + 1]! & LEFT).toBeTruthy()
      }
    }
  })

  test("a spanning tree on N cells has exactly N-1 edges", () => {
    const p = getPuzzle(31)
    let bits = 0
    for (const row of p.solved) {
      for (const mask of row) {
        bits += [TOP, RIGHT, BOTTOM, LEFT].filter((b) => mask & b).length
      }
    }
    // Each undirected edge is counted twice (once from each endpoint).
    const edges = bits / 2
    expect(edges).toBe(p.size * p.size - 1)
  })
})

describe("solvability contract (scrambled <-> solved)", () => {
  test("the source cell's scrambled mask matches its solved mask", () => {
    // The source button is disabled in the UI, so it must already be solved.
    for (let lv = 1; lv <= PIPES_LEVEL_COUNT; lv++) {
      const p = getPuzzle(lv)
      const [sr, sc] = p.source
      expect(p.scrambled[sr]![sc]).toBe(p.solved[sr]![sc])
    }
  })

  test("every scrambled cell is some CW rotation of its solved cell", () => {
    // This is what makes the puzzle solvable: rotating each cell back into
    // place recovers the solved grid.
    for (let lv = 1; lv <= PIPES_LEVEL_COUNT; lv++) {
      const p = getPuzzle(lv)
      for (let r = 0; r < p.size; r++) {
        for (let c = 0; c < p.size; c++) {
          const solvedMask = p.solved[r]![c]!
          const scrambledMask = p.scrambled[r]![c]!
          const rotations = [0, 1, 2, 3].map((t) => rotateCW(solvedMask, t))
          expect(rotations).toContain(scrambledMask)
        }
      }
    }
  })

  test("rotating each scrambled cell back to a rotation of solved reaches full connectivity", () => {
    // Concrete solvability proof: replace scrambled with solved and confirm
    // the whole grid lights up from the source.
    const p = getPuzzle(64)
    const reached = getConnected(p.solved, p.source, p.size, p.size)
    expect(reached.size).toBe(p.size * p.size)
  })
})

describe("getConnected", () => {
  test("includes the source itself even with no connections", () => {
    const empty = Array.from({ length: 2 }, () => [0, 0])
    const reached = getConnected(empty, [0, 0], 2, 2)
    expect([...reached]).toEqual(["0,0"])
  })

  test("only follows mutual connections, not one-sided masks", () => {
    // (0,0) points RIGHT at (0,1) but (0,1) does not point LEFT back.
    const masks = [
      [RIGHT, 0],
      [0, 0],
    ]
    const reached = getConnected(masks, [0, 0], 2, 2)
    expect(reached.has("0,1")).toBe(false)
    expect(reached.size).toBe(1)
  })

  test("follows a chain of mutually connected cells", () => {
    // (0,0) <-> (0,1) <-> (0,2) all linked along the row.
    const masks = [[RIGHT, RIGHT | LEFT, LEFT]]
    const reached = getConnected(masks, [0, 0], 1, 3)
    expect(reached.size).toBe(3)
    expect(reached.has("0,2")).toBe(true)
  })

  test("does not walk off the grid bounds", () => {
    // Source at the corner points TOP and LEFT into out-of-bounds; stays put.
    const masks = [[TOP | LEFT | RIGHT, LEFT]]
    const reached = getConnected(masks, [0, 0], 1, 2)
    expect(reached.has("0,1")).toBe(true)
    expect(reached.size).toBe(2)
  })
})

describe("getEndpoints", () => {
  test("returns degree-1 cells of the solved tree, excluding the source", () => {
    const p = getPuzzle(7)
    const eps = getEndpoints(p.solved, p.source)
    for (const [r, c] of eps) {
      // never the source
      expect(r === p.source[0] && c === p.source[1]).toBe(false)
      // exactly one connection bit set
      const mask = p.solved[r]![c]!
      const degree = [TOP, RIGHT, BOTTOM, LEFT].filter((b) => mask & b).length
      expect(degree).toBe(1)
    }
    // a 36-cell spanning tree always has at least 2 leaves
    expect(eps.length).toBeGreaterThanOrEqual(2)
  })

  test("is deterministic for a given level", () => {
    expect(getEndpoints(getPuzzle(7).solved, getPuzzle(7).source)).toEqual(
      getEndpoints(getPuzzle(7).solved, getPuzzle(7).source)
    )
  })
})
