import { describe, expect, test } from "bun:test"

import { validateUploadPayload } from "@/lib/approve/upload"

function form(entries: Record<string, string | Blob>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.append(k, v)
  return fd
}

describe("validateUploadPayload", () => {
  test("rejects a missing documentId", () => {
    const fd = form({ file: new File(["%PDF"], "a.pdf") })
    expect(validateUploadPayload(fd)).toEqual({ error: "bad payload" })
  })

  test("rejects a non-File file value (e.g. a plain string field)", () => {
    const fd = form({ documentId: "doc-1", file: "not-a-file" })
    expect(validateUploadPayload(fd)).toEqual({ error: "bad payload" })
  })

  test("rejects a missing file", () => {
    const fd = form({ documentId: "doc-1" })
    expect(validateUploadPayload(fd)).toEqual({ error: "bad payload" })
  })

  test("rejects a file over the 50MB cap (51MB)", () => {
    const big = new File([new Uint8Array(51 * 1024 * 1024)], "big.pdf")
    const fd = form({ documentId: "doc-1", file: big })
    expect(validateUploadPayload(fd)).toEqual({
      error: "PDF too large (>50MB)",
    })
  })

  test("accepts a file exactly at the 50MB boundary (not over)", () => {
    const exact = new File([new Uint8Array(50 * 1024 * 1024)], "edge.pdf")
    const fd = form({ documentId: "doc-1", file: exact })
    const result = validateUploadPayload(fd)
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.documentId).toBe("doc-1")
      expect(result.file).toBeInstanceOf(File)
      expect(result.file.size).toBe(50 * 1024 * 1024)
    }
  })

  test("returns { documentId, file } for a valid payload", () => {
    const file = new File(["%PDF-1.4"], "form.pdf", {
      type: "application/pdf",
    })
    const fd = form({ documentId: "doc-42", file })
    const result = validateUploadPayload(fd)
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.documentId).toBe("doc-42")
      expect(result.file).toBeInstanceOf(File)
      expect(result.file.name).toBe("form.pdf")
    }
  })
})
