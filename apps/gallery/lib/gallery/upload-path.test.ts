import { describe, expect, test } from "bun:test"

import {
  buildClientObjectPath,
  objectNameFromPath,
  resolveStorageExtension,
  safeFilenameExtension,
  storageExtensionForMime,
} from "@/lib/gallery/upload-path"
import {
  buildArtworkName,
  inferArtworkName,
  sanitizeArtworkName,
} from "@/lib/gallery/upload-naming"
import {
  describeUploadFailure,
  formatFailurePreview,
  isAbortError,
  stageFromRegisterError,
  UploadFailureError,
  userMessageForStage,
} from "@/lib/gallery/upload-errors"
import {
  allObjectNamesPresent,
  DEFAULT_VERIFY_PLAN,
  objectNamesFromPaths,
  storageSearchOptions,
} from "@/lib/gallery/storage-verify"

describe("storageExtensionForMime", () => {
  test("maps allowed image and video mimes", () => {
    expect(storageExtensionForMime("image/jpeg")).toBe("jpg")
    expect(storageExtensionForMime("image/heic")).toBe("heic")
    expect(storageExtensionForMime("video/quicktime")).toBe("mov")
  })

  test("returns null for unknown mime", () => {
    expect(storageExtensionForMime("application/pdf")).toBeNull()
  })
})

describe("safeFilenameExtension", () => {
  test("accepts plain ascii extensions", () => {
    expect(safeFilenameExtension("IMG_1234.HEIC")).toBe("heic")
    expect(safeFilenameExtension("clip.MP4")).toBe("mp4")
  })

  test("rejects unicode / spaces / long tails in the extension segment", () => {
    expect(safeFilenameExtension("相片.jpg")).toBe("jpg")
    expect(safeFilenameExtension("photo.jpe g")).toBeNull()
    expect(safeFilenameExtension("photo.toolongext")).toBeNull()
    expect(safeFilenameExtension("noext")).toBeNull()
  })

  test("strips path segments before reading the extension", () => {
    expect(safeFilenameExtension("C:\\Users\\a\\b\\photo.png")).toBe("png")
  })
})

describe("resolveStorageExtension", () => {
  test("prefers mime over a misleading filename extension", () => {
    expect(resolveStorageExtension("image/heic", "IMG_1.JPG")).toBe("heic")
    expect(resolveStorageExtension("video/mp4", "clip.mov")).toBe("mp4")
  })

  test("falls back to filename when mime is empty", () => {
    expect(resolveStorageExtension("", "shot.webp")).toBe("webp")
  })
})

describe("buildClientObjectPath", () => {
  test("builds userId/uuid.ext", () => {
    const uid = "11111111-1111-4111-8111-111111111111"
    const id = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    expect(buildClientObjectPath(uid, "jpg", id)).toBe(`${uid}/${id}.jpg`)
  })
})

describe("objectNameFromPath", () => {
  test("strips the user prefix", () => {
    const uid = "11111111-1111-4111-8111-111111111111"
    expect(objectNameFromPath(`${uid}/a.jpg`, uid)).toBe("a.jpg")
  })
})

describe("sanitizeArtworkName / buildArtworkName", () => {
  test("strips control chars and collapses whitespace", () => {
    expect(sanitizeArtworkName("  hello\n\tworld  ")).toBe("hello world")
    expect(sanitizeArtworkName("")).toBe("Untitled")
  })

  test("clamps very long names", () => {
    const long = "あ".repeat(200)
    expect(sanitizeArtworkName(long).length).toBeLessThanOrEqual(120)
  })

  test("sequence naming appends index after cover", () => {
    const files = [{ name: "a.jpg" }, { name: "b.jpg" }]
    expect(buildArtworkName(files, "Trip", 0)).toBe("Trip")
    expect(buildArtworkName(files, "Trip", 1)).toBe("Trip1")
  })

  test("infers stem from filename when base empty", () => {
    expect(inferArtworkName("Sunset over Taipei.HEIC")).toBe(
      "Sunset over Taipei"
    )
    expect(buildArtworkName([{ name: "x.png" }], "", 0)).toBe("x")
  })
})

describe("describeUploadFailure", () => {
  test("classifies File not found as storage-verify with retry hint", () => {
    const described = describeUploadFailure(
      new Error("File not found in storage. Try uploading again.")
    )
    expect(described.stage).toBe("storage-verify")
    expect(described.userMessage.toLowerCase()).toContain("retry")
  })

  test("classifies Failed to fetch as network", () => {
    const described = describeUploadFailure(new TypeError("Failed to fetch"))
    expect(described.stage).toBe("network")
  })

  test("classifies encoder CDN failures as video-processing", () => {
    const described = describeUploadFailure(
      new Error(
        "Could not load the browser encoder (CDN blocked or offline) — allow unpkg"
      )
    )
    expect(described.stage).toBe("video-processing")
    expect(described.userMessage.toLowerCase()).toContain("compress")
  })

  test("preserves UploadFailureError stage", () => {
    const described = describeUploadFailure(
      new UploadFailureError("video-processing", "memory access out of bounds")
    )
    expect(described.stage).toBe("video-processing")
  })

  test("userMessageForStage covers every stage", () => {
    const stages = [
      "type",
      "video-processing",
      "storage-upload",
      "storage-verify",
      "db-insert",
      "network",
      "aborted",
      "unknown",
    ] as const
    for (const stage of stages) {
      expect(userMessageForStage(stage, "detail").length).toBeGreaterThan(5)
    }
  })

  test("isAbortError detects AbortError names and cancel copy", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true)
    expect(isAbortError(new Error("Upload cancelled by user"))).toBe(true)
    expect(isAbortError(new Error("boom"))).toBe(false)
  })

  test("stageFromRegisterError classifies register strings", () => {
    expect(stageFromRegisterError("Database insert failed: x")).toBe(
      "db-insert"
    )
    expect(stageFromRegisterError("verify upload timed out")).toBe(
      "storage-verify"
    )
    expect(stageFromRegisterError("Invalid media type")).toBe("type")
    expect(stageFromRegisterError("Failed to fetch")).toBe("network")
    expect(stageFromRegisterError("Not signed in")).toBe("unknown")
  })

  test("formatFailurePreview includes name stage and message", () => {
    const preview = formatFailurePreview({
      file: new File(["x"], "clip.mp4"),
      detail: "raw",
      userMessage: "Could not process",
      stage: "video-processing",
      sequenceId: null,
      sequenceIndex: null,
    })
    expect(preview).toContain("clip.mp4")
    expect(preview).toContain("video-processing")
    expect(preview).toContain("Could not process")
  })
})

describe("storage-verify helpers", () => {
  test("objectNamesFromPaths strips user prefix", () => {
    const uid = "u1"
    expect(objectNamesFromPaths([`${uid}/a.jpg`, `${uid}/b.mp4`], uid)).toEqual(
      ["a.jpg", "b.mp4"]
    )
  })

  test("allObjectNamesPresent requires every expected name", () => {
    expect(allObjectNamesPresent(["a.jpg"], ["a.jpg", "b.jpg"])).toBe(true)
    expect(allObjectNamesPresent(["a.jpg", "c.jpg"], ["a.jpg"])).toBe(false)
  })

  test("search options target one object name", () => {
    expect(storageSearchOptions("abc.heic")).toEqual({
      limit: 20,
      search: "abc.heic",
    })
  })

  test("default verify plan backs off", () => {
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(0)).toBe(0)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(1)).toBe(150)
    expect(DEFAULT_VERIFY_PLAN.delayBeforeMs(20)).toBe(900)
  })
})
