import { describe, expect, test } from "bun:test"

import { saveZip } from "@/lib/gallery/zip"

describe("saveZip", () => {
  test("rejects empty entry lists before building a zip", async () => {
    await expect(saveZip("empty.zip", [])).rejects.toThrow("Nothing to zip")
  })
})
