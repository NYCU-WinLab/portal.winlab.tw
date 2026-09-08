import { describe, expect, test } from "bun:test"

import { describeZipDownloadResult } from "@/lib/gallery/zip-result"

describe("describeZipDownloadResult", () => {
  test("success when nothing failed", () => {
    expect(
      describeZipDownloadResult({ count: 3, failed: 0, noun: "photo" })
    ).toEqual({
      severity: "success",
      title: "Saved 3 photos as ZIP",
    })
  })

  test("warning when some fetches were skipped", () => {
    expect(
      describeZipDownloadResult({ count: 1, failed: 2, noun: "work" })
    ).toEqual({
      severity: "warning",
      title: "Saved 1 work as ZIP",
      description: "2 could not be fetched and were skipped.",
    })
  })

  test("singular failed copy", () => {
    expect(
      describeZipDownloadResult({ count: 4, failed: 1, noun: "photo" })
        .description
    ).toBe("1 could not be fetched and was skipped.")
  })
})
