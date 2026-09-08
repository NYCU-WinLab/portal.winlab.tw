import { describe, expect, test } from "bun:test"

import {
  describeWallOrderRestored,
  describeWallReshuffled,
} from "@/lib/gallery/wall-shuffle-toast"

describe("describeWallReshuffled", () => {
  test("returns the reshuffle success title", () => {
    expect(describeWallReshuffled()).toBe("Wall reshuffled.")
  })
})

describe("describeWallOrderRestored", () => {
  test("returns the restore success title", () => {
    expect(describeWallOrderRestored()).toBe("Wall order restored.")
  })
})
