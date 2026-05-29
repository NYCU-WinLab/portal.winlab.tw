import { describe, expect, test } from "bun:test"

import type { OAuthClientRow, OAuthClientStore } from "@/lib/auth/oauth-clients"
import {
  parseAuthorizeRequest,
  parseTokenAuthorizationCodeRequest,
  validateOAuthClientRequest,
} from "@/lib/auth/oauth-request"

function fakeStore(rows: OAuthClientRow[]): OAuthClientStore {
  return {
    async insert() {},
    async selectById(clientId) {
      return rows.find((r) => r.client_id === clientId) ?? null
    },
  }
}

const baseClient: OAuthClientRow = {
  client_id: "client-abc",
  client_name: "Test Client",
  redirect_uris: ["https://app.example.com/callback"],
  grant_types: ["authorization_code"],
  response_types: ["code"],
}

describe("parseAuthorizeRequest", () => {
  test("maps snake_case params to camelCase fields", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      code_challenge: "abc123",
      code_challenge_method: "S256",
      resource: "https://mcp.winlab.tw/mcp",
      state: "xyz",
    })

    expect(parseAuthorizeRequest(params)).toEqual({
      clientId: "client-abc",
      redirectUri: "https://app.example.com/callback",
      responseType: "code",
      codeChallenge: "abc123",
      codeChallengeMethod: "S256",
      resource: "https://mcp.winlab.tw/mcp",
      state: "xyz",
    })
  })

  test("resource and state are optional", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      code_challenge: "abc123",
      code_challenge_method: "S256",
    })

    const result = parseAuthorizeRequest(params)
    expect(result.resource).toBeUndefined()
    expect(result.state).toBeUndefined()
  })

  test("rejects a response_type downgrade away from 'code'", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "https://app.example.com/callback",
      response_type: "token",
      code_challenge: "abc123",
      code_challenge_method: "S256",
    })

    expect(() => parseAuthorizeRequest(params)).toThrow()
  })

  test("rejects a code_challenge_method downgrade away from 'S256'", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      code_challenge: "abc123",
      code_challenge_method: "plain",
    })

    expect(() => parseAuthorizeRequest(params)).toThrow()
  })

  test("rejects a non-URL redirect_uri", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "not-a-url",
      response_type: "code",
      code_challenge: "abc123",
      code_challenge_method: "S256",
    })

    expect(() => parseAuthorizeRequest(params)).toThrow()
  })

  test("rejects an empty code_challenge", () => {
    const params = new URLSearchParams({
      client_id: "client-abc",
      redirect_uri: "https://app.example.com/callback",
      response_type: "code",
      code_challenge: "",
      code_challenge_method: "S256",
    })

    expect(() => parseAuthorizeRequest(params)).toThrow()
  })
})

describe("parseTokenAuthorizationCodeRequest", () => {
  function form(fields: Record<string, string>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v)
    return fd
  }

  test("maps form fields to camelCase, resource omitted -> undefined", () => {
    const result = parseTokenAuthorizationCodeRequest(
      form({
        code: "auth-code",
        code_verifier: "verifier",
        client_id: "client-abc",
        redirect_uri: "https://app.example.com/callback",
      })
    )

    expect(result).toEqual({
      code: "auth-code",
      codeVerifier: "verifier",
      clientId: "client-abc",
      redirectUri: "https://app.example.com/callback",
      resource: undefined,
    })
  })

  test("carries resource through when present", () => {
    const result = parseTokenAuthorizationCodeRequest(
      form({
        code: "auth-code",
        code_verifier: "verifier",
        client_id: "client-abc",
        redirect_uri: "https://app.example.com/callback",
        resource: "https://mcp.winlab.tw/mcp",
      })
    )

    expect(result.resource).toBe("https://mcp.winlab.tw/mcp")
  })

  test("rejects a missing required field", () => {
    expect(() =>
      parseTokenAuthorizationCodeRequest(
        form({
          code: "auth-code",
          client_id: "client-abc",
          redirect_uri: "https://app.example.com/callback",
        })
      )
    ).toThrow()
  })

  test("rejects a non-URL redirect_uri", () => {
    expect(() =>
      parseTokenAuthorizationCodeRequest(
        form({
          code: "auth-code",
          code_verifier: "verifier",
          client_id: "client-abc",
          redirect_uri: "nope",
        })
      )
    ).toThrow()
  })
})

describe("validateOAuthClientRequest", () => {
  test("returns the client when client_id, redirect_uri and resource all match", async () => {
    const client = await validateOAuthClientRequest(
      {
        clientId: "client-abc",
        redirectUri: "https://app.example.com/callback",
        resource: "https://mcp.winlab.tw/mcp",
      },
      {
        expectedResource: "https://mcp.winlab.tw/mcp",
        store: fakeStore([baseClient]),
      }
    )

    expect(client.client_id).toBe("client-abc")
  })

  test("throws Unknown client_id when the store has no such client", async () => {
    await expect(
      validateOAuthClientRequest(
        {
          clientId: "missing",
          redirectUri: "https://app.example.com/callback",
        },
        { expectedResource: "https://mcp.winlab.tw/mcp", store: fakeStore([]) }
      )
    ).rejects.toThrow("Unknown client_id")
  })

  test("throws Invalid redirect_uri when redirect is not in the allowlist", async () => {
    await expect(
      validateOAuthClientRequest(
        {
          clientId: "client-abc",
          redirectUri: "https://evil.example.com/callback",
        },
        {
          expectedResource: "https://mcp.winlab.tw/mcp",
          store: fakeStore([baseClient]),
        }
      )
    ).rejects.toThrow("Invalid redirect_uri")
  })

  test("throws Invalid resource when resource does not match expectedResource", async () => {
    await expect(
      validateOAuthClientRequest(
        {
          clientId: "client-abc",
          redirectUri: "https://app.example.com/callback",
          resource: "https://other.example.com/mcp",
        },
        {
          expectedResource: "https://mcp.winlab.tw/mcp",
          store: fakeStore([baseClient]),
        }
      )
    ).rejects.toThrow("Invalid resource")
  })

  test("skips the resource check when no resource is supplied", async () => {
    const client = await validateOAuthClientRequest(
      {
        clientId: "client-abc",
        redirectUri: "https://app.example.com/callback",
      },
      {
        expectedResource: "https://mcp.winlab.tw/mcp",
        store: fakeStore([baseClient]),
      }
    )

    expect(client.client_id).toBe("client-abc")
  })

  test("redirect_uri match is exact — a trailing slash is rejected", async () => {
    await expect(
      validateOAuthClientRequest(
        {
          clientId: "client-abc",
          redirectUri: "https://app.example.com/callback/",
        },
        {
          expectedResource: "https://mcp.winlab.tw/mcp",
          store: fakeStore([baseClient]),
        }
      )
    ).rejects.toThrow("Invalid redirect_uri")
  })
})
