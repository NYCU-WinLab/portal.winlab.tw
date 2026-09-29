import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createClient } from "@supabase/supabase-js"

import {
  uploadBytesToStorage,
  uploadImageFile,
} from "@/lib/gallery/upload-pipeline"

// The gallery bucket checks the multipart part's own type, so these hold the
// type that goes over the wire, not the contentType option.
let parts: { url: string; type: string }[]
let removed: string[]
let refuse: boolean
// Aborted while the storage request is in flight, like a member pressing
// cancel mid-upload: storage-js never sees the signal, so the upload lands.
let cancelDuringUpload: AbortController | null
const restorers: (() => void)[] = []

beforeEach(() => {
  parts = []
  removed = []
  refuse = false
  cancelDuringUpload = null
  const fetchSpy = spyOn(globalThis, "fetch")
  restorers.push(() => fetchSpy.mockRestore())
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const url = decodeURIComponent(String(input))
    if (init?.method === "DELETE") {
      const body = JSON.parse(String(init.body)) as { prefixes: string[] }
      removed.push(...body.prefixes)
      return Response.json([])
    }
    const part = init?.body instanceof FormData ? init.body.get("") : null
    parts.push({ url, type: part instanceof Blob ? part.type : "" })
    cancelDuringUpload?.abort()
    return refuse
      ? Response.json(
          {
            statusCode: "415",
            error: "invalid_mime_type",
            message: "mime type application/octet-stream is not supported",
          },
          { status: 400 }
        )
      : Response.json({ Key: "gallery/x", Id: "obj" })
  }
  fetchSpy.mockImplementation(Object.assign(respond, { preconnect: () => {} }))
})

afterEach(() => {
  for (const restore of restorers) restore()
  restorers.length = 0
})

const member = () =>
  createClient("https://database.example", "member-jwt", {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as Parameters<typeof uploadBytesToStorage>[0]

describe("uploadBytesToStorage", () => {
  test("sends an untyped HEIC as image/heic", async () => {
    const heic = new File(["x"], "IMG_0001.heic")
    await uploadBytesToStorage(member(), "u1/a.heic", heic, "image/heic")
    expect(parts).toEqual([
      {
        url: "https://database.example/storage/v1/object/gallery/u1/a.heic",
        type: "image/heic",
      },
    ])
  })

  test("sends an image/jpg JPEG as image/jpeg", async () => {
    const jpg = new File(["x"], "photo.jpg", { type: "image/jpg" })
    await uploadBytesToStorage(member(), "u1/b.jpg", jpg, "image/jpeg")
    expect(parts.map((p) => p.type)).toEqual(["image/jpeg"])
  })

  test("a refused upload is a storage-upload failure", async () => {
    refuse = true
    const jpg = new File(["x"], "c.jpg", { type: "image/jpeg" })
    await expect(
      uploadBytesToStorage(member(), "u1/c.jpg", jpg, "image/jpeg")
    ).rejects.toMatchObject({ stage: "storage-upload" })
  })
})

describe("cancelling an upload", () => {
  const jpeg = () =>
    new File(
      [
        new Uint8Array([
          0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46,
        ]),
      ],
      "photo.jpg",
      { type: "image/jpeg" }
    )

  test("before the upload, nothing is sent", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      uploadBytesToStorage(
        member(),
        "u1/e.jpg",
        jpeg(),
        "image/jpeg",
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(parts).toEqual([])
  })

  test("while the bytes are in flight, the caller gets to clean up", async () => {
    const controller = new AbortController()
    cancelDuringUpload = controller
    await uploadBytesToStorage(
      member(),
      "u1/d.jpg",
      jpeg(),
      "image/jpeg",
      controller.signal
    )
    expect(controller.signal.aborted).toBe(true)
    expect(parts).toHaveLength(1)
  })

  test("a photo that landed is removed, then the cancel is reported", async () => {
    const controller = new AbortController()
    cancelDuringUpload = controller
    await expect(
      uploadImageFile({
        supabase: member(),
        userId: "u1",
        file: jpeg(),
        resolved: { kind: "image", mime: "image/jpeg" },
        artworkName: "cancelled",
        setStatus: () => {},
        labelPrefix: "",
        sequenceId: null,
        sequenceIndex: null,
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: "AbortError" })
    const stored = parts[0]?.url.split("/object/gallery/")[1] ?? ""
    expect(stored).toMatch(/^u1\/.+\.jpg$/)
    expect(removed).toEqual([stored])
  })
})
