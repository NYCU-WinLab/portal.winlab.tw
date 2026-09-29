import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { createClient } from "@supabase/supabase-js"

import { uploadBytesToStorage } from "@/lib/gallery/upload-pipeline"

// The gallery bucket checks the multipart part's own type, so these hold the
// type that goes over the wire, not the contentType option.
let parts: { url: string; type: string }[]
let refuse: boolean
const restorers: (() => void)[] = []

beforeEach(() => {
  parts = []
  refuse = false
  const fetchSpy = spyOn(globalThis, "fetch")
  restorers.push(() => fetchSpy.mockRestore())
  const respond = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    const part = init?.body instanceof FormData ? init.body.get("") : null
    parts.push({
      url: decodeURIComponent(String(input)),
      type: part instanceof Blob ? part.type : "",
    })
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
