import { describe, expect, test } from "bun:test"

import {
  describeWallSelectionCount,
  orderedSelectedWallIds,
  selectWallIdRange,
  toggleSelectAllWallIds,
  toggleWallSelection,
} from "@/lib/gallery/wall-selection"

describe("toggleWallSelection", () => {
  test("adds and removes without mutating the input set", () => {
    const start = new Set(["a"])
    const added = toggleWallSelection(start, "b")
    expect([...added].sort()).toEqual(["a", "b"])
    expect(start.has("b")).toBe(false)

    const removed = toggleWallSelection(added, "a")
    expect([...removed]).toEqual(["b"])
    expect(added.has("a")).toBe(true)
  })
})

describe("toggleSelectAllWallIds", () => {
  test("selects all when incomplete", () => {
    expect([
      ...toggleSelectAllWallIds(new Set(["a"]), ["a", "b", "c"]),
    ]).toEqual(["a", "b", "c"])
  })

  test("clears when every id is selected", () => {
    expect([
      ...toggleSelectAllWallIds(new Set(["a", "b"]), ["a", "b"]),
    ]).toEqual([])
  })

  test("returns empty for empty wall", () => {
    expect([...toggleSelectAllWallIds(new Set(["a"]), [])]).toEqual([])
  })
})

describe("orderedSelectedWallIds", () => {
  test("preserves wall order and drops unselected", () => {
    expect(
      orderedSelectedWallIds(["a", "b", "c"], new Set(["c", "a"]))
    ).toEqual(["a", "c"])
  })

  test("returns empty when nothing selected", () => {
    expect(orderedSelectedWallIds(["a"], new Set())).toEqual([])
  })
})

describe("describeWallSelectionCount", () => {
  test("formats counts", () => {
    expect(describeWallSelectionCount(0)).toBe("Nothing selected")
    expect(describeWallSelectionCount(1)).toBe("1 photo selected")
    expect(describeWallSelectionCount(4)).toBe("4 photos selected")
  })

  test("treats negative counts as nothing selected", () => {
    expect(describeWallSelectionCount(-1)).toBe("Nothing selected")
    expect(describeWallSelectionCount(-99)).toBe("Nothing selected")
  })
})

describe("selectWallIdRange", () => {
  test("selects inclusive contiguous range", () => {
    expect([
      ...selectWallIdRange(new Set(["a"]), ["a", "b", "c", "d"], "a", "c"),
    ]).toEqual(["a", "b", "c"])
  })

  test("works backwards", () => {
    expect([
      ...selectWallIdRange(new Set(), ["a", "b", "c"], "c", "a"),
    ]).toEqual(["a", "b", "c"])
  })

  test("falls back to toggle when anchor missing", () => {
    expect([
      ...selectWallIdRange(new Set(), ["a", "b"], "missing", "b"),
    ]).toEqual(["b"])
  })

  test("falls back to toggle when target missing", () => {
    expect([
      ...selectWallIdRange(new Set(["a"]), ["a", "b"], "a", "missing"),
    ]).toEqual(["a", "missing"])
  })
})
