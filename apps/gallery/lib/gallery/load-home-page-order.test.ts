import { describe, expect, test } from "bun:test"

import {
  applyWallFilters,
  intersectCoverIdFilters,
  orderRowsByIdList,
  sliceCoverIdsForPage,
  type WallFilterable,
} from "@/lib/gallery/load-home-page"
import type { GalleryHomeFilters } from "@/lib/gallery/home-filters"

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

describe("intersectCoverIdFilters", () => {
  test("null filters leave the result unconstrained", () => {
    expect(intersectCoverIdFilters(null, null)).toBeNull()
  })

  test("none wins over any other filter", () => {
    expect(intersectCoverIdFilters(["a"], "none", ["a", "b"])).toBe("none")
  })

  test("intersects arrays and preserves left order", () => {
    expect(
      intersectCoverIdFilters(["a", "b", "c"], null, ["c", "a", "d"])
    ).toEqual(["a", "c"])
  })

  test("empty intersection collapses to none", () => {
    expect(intersectCoverIdFilters(["a"], ["b"])).toBe("none")
  })
})

function createFilterRecorder() {
  const calls: Array<{ method: string; args: string[] }> = []
  const api: WallFilterable = {
    eq(column, value) {
      calls.push({ method: "eq", args: [column, value] })
      return api
    },
    gte(column, value) {
      calls.push({ method: "gte", args: [column, value] })
      return api
    },
    ilike(column, value) {
      calls.push({ method: "ilike", args: [column, value] })
      return api
    },
  }
  return { api, calls }
}

describe("applyWallFilters", () => {
  const empty: GalleryHomeFilters = {
    uploaderId: null,
    media: "all",
    uploadedAfter: null,
    query: null,
    tagSlug: null,
    savedOnly: false,
    albumSlug: null,
  }

  test("applies uploader, media, after, and query filters", () => {
    const { api, calls } = createFilterRecorder()
    applyWallFilters(api, {
      ...empty,
      uploaderId: "user-1",
      media: "video",
      uploadedAfter: "2026-01-01",
      query: "retreat",
    })
    expect(calls).toEqual([
      { method: "eq", args: ["created_by", "user-1"] },
      { method: "eq", args: ["media_type", "video"] },
      { method: "gte", args: ["created_at", "2026-01-01"] },
      { method: "ilike", args: ["name", "%retreat%"] },
    ])
  })

  test("skipQuery omits the name ilike clause", () => {
    const { api, calls } = createFilterRecorder()
    applyWallFilters(api, { ...empty, query: "retreat" }, { skipQuery: true })
    expect(calls).toEqual([])
  })

  test("media all leaves media_type untouched", () => {
    const { api, calls } = createFilterRecorder()
    applyWallFilters(api, { ...empty, media: "all" })
    expect(calls).toEqual([])
  })
})
