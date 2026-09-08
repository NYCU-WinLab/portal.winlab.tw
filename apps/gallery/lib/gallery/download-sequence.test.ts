import { describe, expect, mock, test } from "bun:test"

import { downloadSequenceZip } from "@/lib/gallery/download-sequence"
import type { ZipEntry } from "@/lib/gallery/zip"

describe("downloadSequenceZip", () => {
  test("rejects empty and oversized sequences", async () => {
    await expect(downloadSequenceZip([])).rejects.toThrow("no shots")

    await expect(
      downloadSequenceZip(
        Array.from({ length: 41 }, (_, i) => ({
          name: `s${i}`,
          image_path: `u/${i}.jpg`,
        }))
      )
    ).rejects.toThrow("longer than")
  })

  test("fetches in sequence order, reports progress, and saves entries", async () => {
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

    const result = await downloadSequenceZip(
      [
        { name: "late", image_path: "u/late.jpg", sequence_index: 2 },
        { name: "first", image_path: "u/first.jpg", sequence_index: 0 },
        { name: "mid", image_path: "u/mid.jpg", sequence_index: 1 },
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
      }
    )

    expect(urls).toEqual([
      "https://cdn.test/u/first.jpg",
      "https://cdn.test/u/mid.jpg",
      "https://cdn.test/u/late.jpg",
    ])
    expect(progress[0]).toEqual({ completed: 0, total: 3 })
    expect(progress.at(-1)).toEqual({ completed: 3, total: 3 })
    expect(result).toEqual({ count: 3, filename: "first-story.zip" })
    expect(saved.filename).toBe("first-story.zip")
    expect(saved.entries.map((e) => e.name)).toEqual([
      "01_first.jpg",
      "02_mid.jpg",
      "03_late.jpg",
    ])
  })

  test("surfaces HTTP failures", async () => {
    const fetchImpl = mock(
      async () => new Response(null, { status: 404 })
    ) as unknown as typeof fetch

    await expect(
      downloadSequenceZip(
        [{ name: "a", image_path: "u/a.jpg", sequence_index: 0 }],
        {
          fetchImpl,
          resolveUrl: (path) => path,
          save: async () => undefined,
        }
      )
    ).rejects.toThrow("Could not fetch shot 1")
  })
})
