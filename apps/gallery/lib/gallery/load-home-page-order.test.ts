import { describe, expect, test } from "bun:test"

import {
  orderRowsByIdList,
  sliceCoverIdsForPage,
} from "@/lib/gallery/load-home-page"

describe("orderRowsByIdList", () => {
  test("reorders fetched rows to match the ranked id list", () => {
    expect(
      orderRowsByIdList(
        [
          { id: "b", name: "B" },
          { id: "a", name: "A" },
          { id: "c", name: "C" },
        ],
        ["a", "c", "b"]
      ).map((row) => row.id)
    ).toEqual(["a", "c", "b"])
  })

  test("drops ids missing from the fetch", () => {
    expect(
      orderRowsByIdList([{ id: "a" }], ["a", "missing"]).map((row) => row.id)
    ).toEqual(["a"])
  })
})

describe("sliceCoverIdsForPage", () => {
  test("slices inclusive to-index into an exclusive end", () => {
    expect(sliceCoverIdsForPage(["a", "b", "c", "d"], 1, 2)).toEqual(["b", "c"])
  })

  test("returns empty past the end", () => {
    expect(sliceCoverIdsForPage(["a"], 5, 10)).toEqual([])
  })
})
