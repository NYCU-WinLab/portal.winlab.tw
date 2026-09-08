import { describe, expect, test } from "bun:test"

import { describeUploadWorksToast } from "@/lib/gallery/upload-toast"

describe("describeUploadWorksToast", () => {
  test("singular", () => {
    expect(describeUploadWorksToast(1)).toBe("Uploaded 1 work.")
  })

  test("plural", () => {
    expect(describeUploadWorksToast(3)).toBe("Uploaded 3 works.")
  })
})
