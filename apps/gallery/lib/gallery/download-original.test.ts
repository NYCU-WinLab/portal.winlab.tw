import { describe, expect, test } from "bun:test"

import { downloadGalleryOriginal } from "@/lib/gallery/download-original"

describe("downloadGalleryOriginal", () => {
  test("rejects blank paths", async () => {
    await expect(
      downloadGalleryOriginal({ displayName: "Shot", imagePath: "  " })
    ).rejects.toThrow("no downloadable file")
  })

  test("fetches the original and saves a named blob", async () => {
    const saved: { filename: string; size: number }[] = []
    const result = await downloadGalleryOriginal({
      displayName: "Lab Retreat",
      imagePath: "alice/shot.jpg",
      resolveUrl: (path) => `https://cdn.test/${path}`,
      fetchImpl: async (input) => {
        expect(String(input)).toBe("https://cdn.test/alice/shot.jpg")
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
      },
      save: (blob, filename) => {
        saved.push({ filename, size: blob.size })
      },
    })

    expect(result.filename).toBe("Lab_Retreat.jpg")
    expect(saved).toEqual([{ filename: "Lab_Retreat.jpg", size: 3 }])
  })

  test("surfaces HTTP failures", async () => {
    await expect(
      downloadGalleryOriginal({
        displayName: "Shot",
        imagePath: "alice/shot.jpg",
        resolveUrl: () => "https://cdn.test/x",
        fetchImpl: async () => new Response(null, { status: 404 }),
      })
    ).rejects.toThrow("404")
  })
})
