import { describe, expect, test } from "bun:test"

import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  guessExtension,
  inferMimeFromFilename,
  resolveImageMimeType,
  resolveMediaMimeType,
} from "@/lib/gallery/mime"

describe("resolveMediaMimeType", () => {
  test("trusts explicit image mime types", () => {
    const file = new File([], "art.png", { type: "image/png" })
    expect(resolveMediaMimeType(file)).toEqual({
      kind: "image",
      mime: "image/png",
    })
  })

  test("trusts explicit video mime types", () => {
    const file = new File([], "clip.mp4", { type: "video/mp4" })
    expect(resolveMediaMimeType(file)).toEqual({
      kind: "video",
      mime: "video/mp4",
    })
  })

  test("normalizes image/jpg to image/jpeg", () => {
    const file = new File([], "photo.jpg", { type: "image/jpg" })
    expect(resolveMediaMimeType(file)).toEqual({
      kind: "image",
      mime: "image/jpeg",
    })
  })

  test("falls back to extension when type is empty", () => {
    const file = new File([], "movie.mov", { type: "" })
    expect(resolveMediaMimeType(file)).toEqual({
      kind: "video",
      mime: "video/quicktime",
    })
  })

  test("falls back to extension when type is application/octet-stream", () => {
    const file = new File([], "x.webp", { type: "application/octet-stream" })
    expect(resolveMediaMimeType(file)).toEqual({
      kind: "image",
      mime: "image/webp",
    })
  })

  test("rejects unknown types with no recognizable extension", () => {
    const file = new File([], "scary.exe", { type: "application/x-msdownload" })
    expect(resolveMediaMimeType(file)).toBeNull()
  })

  test("rejects extensions outside the whitelist even if type is empty", () => {
    const file = new File([], "track.mp3", { type: "" })
    expect(resolveMediaMimeType(file)).toBeNull()
  })
})

describe("resolveImageMimeType", () => {
  test("returns string only when the resolved kind is image", () => {
    const img = new File([], "a.png", { type: "image/png" })
    expect(resolveImageMimeType(img)).toBe("image/png")
  })

  test("returns null for video uploads — server-side image-only paths must reject them", () => {
    const vid = new File([], "a.mp4", { type: "video/mp4" })
    expect(resolveImageMimeType(vid)).toBeNull()
  })
})

describe("inferMimeFromFilename", () => {
  test("covers every allowed extension", () => {
    const cases: Array<[string, string]> = [
      ["a.jpg", "image/jpeg"],
      ["a.jpeg", "image/jpeg"],
      ["a.png", "image/png"],
      ["a.webp", "image/webp"],
      ["a.gif", "image/gif"],
      ["a.avif", "image/avif"],
      ["a.heic", "image/heic"],
      ["a.heif", "image/heif"],
      ["a.webm", "video/webm"],
      ["a.mp4", "video/mp4"],
      ["a.m4v", "video/mp4"],
      ["a.mov", "video/quicktime"],
    ]
    for (const [name, mime] of cases) {
      expect(inferMimeFromFilename(name)).toBe(mime)
    }
  })

  test("returns null for unknown extension", () => {
    expect(inferMimeFromFilename("x.bin")).toBeNull()
    expect(inferMimeFromFilename("noext")).toBeNull()
  })
})

describe("guessExtension", () => {
  test("trusts a sensible filename extension first", () => {
    expect(guessExtension("image/jpeg", "photo.jpg")).toBe("jpg")
    expect(guessExtension("video/mp4", "clip.MP4")).toBe("mp4")
  })

  test("falls back to mime when the filename has no extension-like tail", () => {
    expect(guessExtension("image/webp", "")).toBe("webp")
    expect(guessExtension("video/webm", "filenamewithoutdot")).toBe("webm")
  })

  test("returns 'bin' for unsupported mime + no extension-like tail", () => {
    expect(guessExtension("application/zip", "")).toBe("bin")
  })
})

describe("whitelist invariants", () => {
  test("image and video sets do not overlap", () => {
    for (const mime of ALLOWED_IMAGE_MIME) {
      expect(ALLOWED_VIDEO_MIME.has(mime)).toBe(false)
    }
  })
})
