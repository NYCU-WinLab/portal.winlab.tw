import { describe, expect, test } from "bun:test"

import {
  describeCouldNotBuildZip,
  describeCouldNotDownload,
  describeDownloadAlbumLabel,
  describeDownloadStoryLabel,
  describeSequenceCompactingToast,
  describeSignInToFavorite,
} from "@/lib/gallery/download-labels"

describe("describeSequenceCompactingToast", () => {
  test("returns the compacting message", () => {
    expect(describeSequenceCompactingToast()).toBe("Compacting sequence slots…")
  })
})

describe("describeDownloadAlbumLabel", () => {
  test("includes count when positive", () => {
    expect(describeDownloadAlbumLabel(4)).toBe("Download album (4)")
  })

  test("omits count when empty", () => {
    expect(describeDownloadAlbumLabel(0)).toBe("Download album")
  })
})

describe("describeDownloadStoryLabel", () => {
  test("plural when multi-shot", () => {
    expect(describeDownloadStoryLabel(3)).toBe("Download story (3)")
  })

  test("singular when one or zero", () => {
    expect(describeDownloadStoryLabel(1)).toBe("Download story")
    expect(describeDownloadStoryLabel(0)).toBe("Download story")
  })
})

describe("describeSignInToFavorite", () => {
  test("returns the auth prompt", () => {
    expect(describeSignInToFavorite()).toBe("Sign in to save favorites.")
  })
})

describe("download failure fallbacks", () => {
  test("describeCouldNotDownload", () => {
    expect(describeCouldNotDownload()).toBe("Could not download")
  })

  test("describeCouldNotBuildZip", () => {
    expect(describeCouldNotBuildZip()).toBe("Could not build the ZIP")
  })
})
