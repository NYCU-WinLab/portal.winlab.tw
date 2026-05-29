import { describe, expect, test } from "bun:test"

import { getOAuthMetadata } from "@/lib/auth/oauth-metadata"
import { getProtectedResourceMetadata } from "@/lib/auth/protected-resource-metadata"

describe("getOAuthMetadata", () => {
  const meta = getOAuthMetadata("https://mcp.winlab.tw")

  test("issuer is the base url", () => {
    expect(meta.issuer).toBe("https://mcp.winlab.tw")
  })

  test("derives the endpoints from the base url", () => {
    expect(meta.authorization_endpoint).toBe(
      "https://mcp.winlab.tw/oauth/authorize"
    )
    expect(meta.token_endpoint).toBe("https://mcp.winlab.tw/oauth/token")
    expect(meta.registration_endpoint).toBe(
      "https://mcp.winlab.tw/oauth/register"
    )
  })

  test("advertises S256 as the only PKCE challenge method", () => {
    expect(meta.code_challenge_methods_supported).toEqual(["S256"])
  })

  test("advertises 'none' as the only token endpoint auth method", () => {
    expect(meta.token_endpoint_auth_methods_supported).toEqual(["none"])
  })

  test("advertises code response type and authz_code + refresh grants", () => {
    expect(meta.response_types_supported).toEqual(["code"])
    expect(meta.grant_types_supported).toEqual([
      "authorization_code",
      "refresh_token",
    ])
  })
})

describe("getProtectedResourceMetadata", () => {
  const prm = getProtectedResourceMetadata("https://mcp.winlab.tw")

  test("resource points at the /mcp resource url", () => {
    expect(prm.resource).toBe("https://mcp.winlab.tw/mcp")
  })

  test("authorization_servers lists the base url", () => {
    expect(prm.authorization_servers).toEqual(["https://mcp.winlab.tw"])
  })

  test("bearer tokens are accepted via the Authorization header", () => {
    expect(prm.bearer_methods_supported).toEqual(["header"])
  })
})
