import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  getBaseUrl,
  getMcpResourceUrl,
  getProtectedResourceMetadataUrl,
} from "@/lib/auth/urls"

const DEFAULT_BASE_URL = "https://mcp.winlab.tw"

describe("getBaseUrl", () => {
  let original: string | undefined

  beforeEach(() => {
    original = process.env.NEXT_PUBLIC_BASE_URL
  })

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
    else process.env.NEXT_PUBLIC_BASE_URL = original
  })

  test("falls back to the default base url when env is unset", () => {
    delete process.env.NEXT_PUBLIC_BASE_URL
    expect(getBaseUrl()).toBe(DEFAULT_BASE_URL)
  })

  test("reads NEXT_PUBLIC_BASE_URL when set", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://staging.example.com"
    expect(getBaseUrl()).toBe("https://staging.example.com")
  })

  test("strips a single trailing slash", () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://staging.example.com/"
    expect(getBaseUrl()).toBe("https://staging.example.com")
  })

  test("empty env value falls back to the default", () => {
    process.env.NEXT_PUBLIC_BASE_URL = ""
    expect(getBaseUrl()).toBe(DEFAULT_BASE_URL)
  })
})

describe("getMcpResourceUrl", () => {
  test("appends /mcp to the supplied base url", () => {
    expect(getMcpResourceUrl("https://example.com")).toBe(
      "https://example.com/mcp"
    )
  })

  test("defaults to the resolved base url", () => {
    const original = process.env.NEXT_PUBLIC_BASE_URL
    delete process.env.NEXT_PUBLIC_BASE_URL
    try {
      expect(getMcpResourceUrl()).toBe(`${DEFAULT_BASE_URL}/mcp`)
    } finally {
      if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_URL
      else process.env.NEXT_PUBLIC_BASE_URL = original
    }
  })
})

describe("getProtectedResourceMetadataUrl", () => {
  test("builds the .well-known PRM url under the base url", () => {
    expect(getProtectedResourceMetadataUrl("https://example.com")).toBe(
      "https://example.com/.well-known/oauth-protected-resource/mcp"
    )
  })
})
