import { describe, expect, test } from "bun:test"

import {
  buildWallSelectionShareText,
  describeWallSelectionCopy,
} from "@/lib/gallery/wall-selection-share"

describe("buildWallSelectionShareText", () => {
  test("joins absolute photo links", () => {
    expect(
      buildWallSelectionShareText(["aaa", "bbb"], "https://gallery.winlab.tw/")
    ).toBe(
      "https://gallery.winlab.tw/?photo=aaa\nhttps://gallery.winlab.tw/?photo=bbb"
    )
  })

  test("dedupes and skips blanks", () => {
    expect(
      buildWallSelectionShareText([" a ", "a", ""], "https://gallery.winlab.tw")
    ).toBe("https://gallery.winlab.tw/?photo=a")
  })
})

describe("describeWallSelectionCopy", () => {
  test("formats count", () => {
    expect(describeWallSelectionCopy(1)).toBe("Copied 1 link.")
    expect(describeWallSelectionCopy(3)).toBe("Copied 3 links.")
  })
})
