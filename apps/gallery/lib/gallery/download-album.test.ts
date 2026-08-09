import { describe, expect, mock, test } from "bun:test"

import { downloadAlbumZip } from "@/lib/gallery/download-album"
import type { ZipEntry } from "@/lib/gallery/zip"

describe("downloadAlbumZip", () => {
  test("rejects empty and oversized albums", async () => {
    await expect(downloadAlbumZip([])).rejects.toThrow("no photos")

    await expect(
      downloadAlbumZip(
        Array.from({ length: 201 }, (_, i) => ({
          name: `p${i}`,
          image_path: `u/${i}.jpg`,
        }))
      )
    ).rejects.toThrow("longer than")
  })

  test("fetches in position order, reports progress, and saves entries", async () => {
    const urls: string[] = []
    const fetchImpl = mock(async (input: RequestInfo | URL) => {
      urls.push(String(input))
      return new Response(new Blob([String(input)]), { status: 200 })
    }) as unknown as typeof fetch

    const progress: Array<{ completed: number; total: number }> = []
    const saved: { filename: string; entries: ZipEntry[] } = {
      filename: "",
      entries: [],
    }

    const result = await downloadAlbumZip(
      [
        { name: "late", image_path: "u/late.jpg", position: 2 },
        { name: "first", image_path: "u/first.jpg", position: 0 },
        { name: "mid", image_path: "u/mid.jpg", position: 1 },
      ],
      {
        fetchImpl,
        resolveUrl: (path) => `https://cdn.test/${path}`,
        concurrency: 1,
        onProgress: (p) => progress.push({ ...p }),
        save: async (filename, entries) => {
          saved.filename = filename
          saved.entries = entries
        },
        zipName: "Lab_trip-album.zip",
      }
    )

    expect(urls).toEqual([
      "https://cdn.test/u/first.jpg",
      "https://cdn.test/u/mid.jpg",
      "https://cdn.test/u/late.jpg",
    ])
    expect(progress[0]).toEqual({ completed: 0, total: 3 })
    expect(progress.at(-1)).toEqual({ completed: 3, total: 3 })
    expect(result).toEqual({
      count: 3,
      failed: 0,
      filename: "Lab_trip-album.zip",
    })
    expect(saved.filename).toBe("Lab_trip-album.zip")
    expect(saved.entries.map((e) => e.name)).toEqual([
      "01_first.jpg",
      "02_mid.jpg",
      "03_late.jpg",
    ])
  })

  test("surfaces HTTP failures when continueOnError is false", async () => {
    const fetchImpl = mock(
      async () => new Response(null, { status: 404 })
    ) as unknown as typeof fetch

    await expect(
      downloadAlbumZip([{ name: "a", image_path: "u/a.jpg", position: 0 }], {
        fetchImpl,
        resolveUrl: (path) => path,
        save: async () => undefined,
        continueOnError: false,
      })
    ).rejects.toThrow("Could not fetch photo 1")
  })

  test("skips blank paths and failed fetches by default", async () => {
    const fetchImpl = mock(async (input: RequestInfo | URL) => {
      if (String(input).includes("bad")) {
        return new Response(null, { status: 500 })
      }
      return new Response(new Blob(["ok"]), { status: 200 })
    }) as unknown as typeof fetch

    const saved: ZipEntry[] = []
    const result = await downloadAlbumZip(
      [
        { name: "good", image_path: "u/good.jpg", position: 0 },
        { name: "blank", image_path: "   ", position: 1 },
        { name: "bad", image_path: "u/bad.jpg", position: 2 },
      ],
      {
        fetchImpl,
        resolveUrl: (path) => `https://cdn.test/${path}`,
        concurrency: 1,
        save: async (_filename, entries) => {
          saved.push(...entries)
        },
        zipName: "partial-album.zip",
      }
    )

    expect(result.count).toBe(1)
    expect(result.failed).toBe(2)
    expect(saved.map((e) => e.name)).toEqual(["01_good.jpg"])
  })

  test("rejects when every fetch fails", async () => {
    const fetchImpl = mock(
      async () => new Response(null, { status: 404 })
    ) as unknown as typeof fetch

    await expect(
      downloadAlbumZip([{ name: "a", image_path: "u/a.jpg", position: 0 }], {
        fetchImpl,
        resolveUrl: (path) => path,
        save: async () => undefined,
      })
    ).rejects.toThrow("Could not download any")
  })
})
