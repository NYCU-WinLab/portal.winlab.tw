import { afterEach, describe, expect, test } from "bun:test"
import type { NextRequest } from "next/server"

import {
  GALLERY_API_CORS,
  isGalleryApiAuthorized,
} from "@/lib/gallery/api-auth"

function requestWithAuth(authorization: string | null): NextRequest {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return authorization
        return null
      },
    },
  } as NextRequest
}

describe("GALLERY_API_CORS", () => {
  test("exposes open CORS for GET/POST/OPTIONS with Authorization", () => {
    expect(GALLERY_API_CORS["Access-Control-Allow-Origin"]).toBe("*")
    expect(GALLERY_API_CORS["Access-Control-Allow-Methods"]).toContain("GET")
    expect(GALLERY_API_CORS["Access-Control-Allow-Methods"]).toContain("POST")
    expect(GALLERY_API_CORS["Access-Control-Allow-Methods"]).toContain(
      "OPTIONS"
    )
    expect(GALLERY_API_CORS["Access-Control-Allow-Headers"]).toContain(
      "Authorization"
    )
    expect(GALLERY_API_CORS["Content-Type"]).toContain("application/json")
  })
})

describe("isGalleryApiAuthorized", () => {
  const previous = process.env.GALLERY_API_SECRET

  afterEach(() => {
    if (previous === undefined) delete process.env.GALLERY_API_SECRET
    else process.env.GALLERY_API_SECRET = previous
  })

  test("rejects when secret is unset", () => {
    delete process.env.GALLERY_API_SECRET
    expect(isGalleryApiAuthorized(requestWithAuth("Bearer anything"))).toBe(
      false
    )
  })

  test("rejects missing or mismatched bearer tokens", () => {
    process.env.GALLERY_API_SECRET = "lab-secret"
    expect(isGalleryApiAuthorized(requestWithAuth(null))).toBe(false)
    expect(isGalleryApiAuthorized(requestWithAuth("Bearer wrong"))).toBe(false)
    expect(isGalleryApiAuthorized(requestWithAuth("lab-secret"))).toBe(false)
  })

  test("accepts an exact Bearer match", () => {
    process.env.GALLERY_API_SECRET = "lab-secret"
    expect(isGalleryApiAuthorized(requestWithAuth("Bearer lab-secret"))).toBe(
      true
    )
  })
})
