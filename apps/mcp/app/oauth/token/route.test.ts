import { describe, expect, test } from "bun:test"

import type { PeekedAuthData, StoredAuthData } from "@/lib/auth/auth-codes"
import type { OAuthClientRow, OAuthClientStore } from "@/lib/auth/oauth-clients"

import { handleAuthorizationCode } from "./route"

// RFC 7636 Appendix B canonical S256 example (same pair used in pkce.test.ts).
const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

const CLIENT_ID = "client-abc"
const REDIRECT_URI = "https://app.example.com/callback"

function fakeClientStore(): OAuthClientStore {
  const row: OAuthClientRow = {
    client_id: CLIENT_ID,
    client_name: "Test Client",
    redirect_uris: [REDIRECT_URI],
    grant_types: ["authorization_code"],
    response_types: ["code"],
  }
  return {
    async insert() {},
    async selectById(clientId) {
      return clientId === CLIENT_ID ? row : null
    },
  }
}

function fakeAuthCodeBackend(peeked: PeekedAuthData | null) {
  let consumed = false
  const calls = { peek: 0, exchange: 0 }

  const storedAfterConsume: StoredAuthData = {
    accessToken: "real-access-token",
    refreshToken: "real-refresh-token",
    expiresIn: 3600,
    codeChallenge: peeked?.codeChallenge ?? "",
    redirectUri: REDIRECT_URI,
    clientId: CLIENT_ID,
  }

  return {
    calls,
    isConsumed: () => consumed,
    peek: async () => {
      calls.peek += 1
      return peeked
    },
    exchange: async () => {
      calls.exchange += 1
      if (consumed || !peeked) return null
      consumed = true
      return storedAfterConsume
    },
  }
}

function tokenRequestBody(overrides: Record<string, string> = {}) {
  const body = new FormData()
  body.set("grant_type", "authorization_code")
  body.set("code", "the-auth-code")
  body.set("code_verifier", RFC_VERIFIER)
  body.set("client_id", CLIENT_ID)
  body.set("redirect_uri", REDIRECT_URI)
  for (const [key, value] of Object.entries(overrides)) body.set(key, value)
  return body
}

describe("handleAuthorizationCode — code-burning DoS regression (audit #182)", () => {
  test("wrong code_verifier: peek is called, exchange (consume) is NOT called", async () => {
    const peeked: PeekedAuthData = {
      codeChallenge: RFC_CHALLENGE,
      redirectUri: REDIRECT_URI,
      clientId: CLIENT_ID,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    const backend = fakeAuthCodeBackend(peeked)

    const body = tokenRequestBody({ code_verifier: "totally-wrong-verifier" })
    const response = await handleAuthorizationCode(body, {
      peek: backend.peek,
      exchange: backend.exchange,
      clientStore: fakeClientStore(),
    })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error).toBe("invalid_grant")

    expect(backend.calls.peek).toBe(1)
    expect(backend.calls.exchange).toBe(0)
    expect(backend.isConsumed()).toBe(false)
  })

  test("wrong verifier followed by the correct verifier still succeeds (code was not burned)", async () => {
    const peeked: PeekedAuthData = {
      codeChallenge: RFC_CHALLENGE,
      redirectUri: REDIRECT_URI,
      clientId: CLIENT_ID,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    const backend = fakeAuthCodeBackend(peeked)
    const clientStore = fakeClientStore()

    const attack = await handleAuthorizationCode(
      tokenRequestBody({ code_verifier: "attacker-guess" }),
      { peek: backend.peek, exchange: backend.exchange, clientStore }
    )
    expect(attack.status).toBe(400)

    const legit = await handleAuthorizationCode(
      tokenRequestBody({ code_verifier: RFC_VERIFIER }),
      { peek: backend.peek, exchange: backend.exchange, clientStore }
    )
    expect(legit.status).toBe(200)
    const json = await legit.json()
    expect(json.access_token).toBe("real-access-token")

    expect(backend.calls.exchange).toBe(1)
    expect(backend.isConsumed()).toBe(true)
  })

  test("correct verifier: peek → validate → exchange all run, token is returned", async () => {
    const peeked: PeekedAuthData = {
      codeChallenge: RFC_CHALLENGE,
      redirectUri: REDIRECT_URI,
      clientId: CLIENT_ID,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }
    const backend = fakeAuthCodeBackend(peeked)

    const response = await handleAuthorizationCode(
      tokenRequestBody({ code_verifier: RFC_VERIFIER }),
      {
        peek: backend.peek,
        exchange: backend.exchange,
        clientStore: fakeClientStore(),
      }
    )

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({
      access_token: "real-access-token",
      refresh_token: "real-refresh-token",
      token_type: "Bearer",
      expires_in: 3600,
    })
    expect(backend.calls.peek).toBe(1)
    expect(backend.calls.exchange).toBe(1)
  })

  test("unknown code: peek returns null, exchange is never called", async () => {
    const backend = fakeAuthCodeBackend(null)

    const response = await handleAuthorizationCode(tokenRequestBody(), {
      peek: backend.peek,
      exchange: backend.exchange,
      clientStore: fakeClientStore(),
    })

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json.error_description).toBe("Invalid or expired authorization code")
    expect(backend.calls.exchange).toBe(0)
  })
})
