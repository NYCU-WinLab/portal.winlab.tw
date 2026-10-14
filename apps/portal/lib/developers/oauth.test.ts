import { beforeEach, expect, test } from "bun:test"
import OAuth2Server from "@node-oauth/oauth2-server"
import { createHash } from "node:crypto"
import { createOAuthServer, hashSecret } from "./oauth"
import type { Application, Code, Grant, OAuthStore, TokenPair } from "./types"

const app: Application = {
  id: "app",
  owner_id: "owner",
  name: "Example",
  description: "Test",
  contact_email: "a@example.org",
  privacy_url: "https://example.org/privacy",
  client_type: "public",
  redirect_uris: ["https://example.org/cb"],
  approved_scopes: ["profile", "groups"],
  enabled: true,
  secret_hash: null,
  created_at: new Date().toISOString(),
}
const grant: Grant = {
  id: "grant",
  app_id: "app",
  user_id: "member",
  scopes: ["profile", "groups"],
  created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86400000).toISOString(),
}
class MemoryStore implements OAuthStore {
  apps = new Map([[app.id, structuredClone(app)]])
  grants = new Map([[grant.id, structuredClone(grant)]])
  codes = new Map<string, Code>()
  tokens = new Map<string, TokenPair>()
  async app(id: string) {
    return this.apps.get(id) ?? null
  }
  async grant(id: string) {
    return this.grants.get(id) ?? null
  }
  async code(hash: string) {
    return this.codes.get(hash) ?? null
  }
  async saveCode(code: Code) {
    if (!this.grants.has(code.grant_id)) throw Error("revoked")
    this.codes.set(code.hash, code)
  }
  async consumeCode(hash: string) {
    return this.codes.delete(hash)
  }
  async token(hash: string, kind: "access" | "refresh") {
    return (
      [...this.tokens.values()].find(
        (t) => t[kind === "access" ? "access_hash" : "refresh_hash"] === hash
      ) ?? null
    )
  }
  async saveToken(token: TokenPair) {
    if (!this.grants.has(token.grant_id)) throw Error("revoked")
    this.tokens.set(token.access_hash, token)
  }
  async consumeRefresh(hash: string) {
    const t = await this.token(hash, "refresh")
    if (!t) return false
    if (t.refresh_used) {
      this.grants.delete(t.grant_id)
      return false
    }
    t.refresh_used = true
    return true
  }
}
let store: MemoryStore
beforeEach(() => {
  store = new MemoryStore()
})
const verifier = "x".repeat(64)
const challenge = createHash("sha256").update(verifier).digest("base64url")
async function authorize(changes: Record<string, string> = {}) {
  const server = createOAuthServer(store, "authorize")
  return server.authorize(
    new OAuth2Server.Request({
      method: "GET",
      headers: {},
      query: {
        client_id: "app",
        redirect_uri: app.redirect_uris[0],
        response_type: "code",
        state: "random",
        scope: "profile groups",
        code_challenge: challenge,
        code_challenge_method: "S256",
        ...changes,
      },
    }),
    new OAuth2Server.Response(),
    {
      authenticateHandler: {
        handle: () => ({ id: "member", grantId: "grant" }),
      },
    }
  )
}
async function exchange(code: string, changes: Record<string, string> = {}) {
  return createOAuthServer(store, "token").token(
    new OAuth2Server.Request({
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "transfer-encoding": "chunked",
      },
      query: {},
      body: {
        grant_type: "authorization_code",
        client_id: "app",
        code,
        redirect_uri: app.redirect_uris[0],
        code_verifier: verifier,
        ...changes,
      },
    }),
    new OAuth2Server.Response()
  )
}
async function refresh(token: string, changes: Record<string, string> = {}) {
  return createOAuthServer(store, "token").token(
    new OAuth2Server.Request({
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "transfer-encoding": "chunked",
      },
      query: {},
      body: {
        grant_type: "refresh_token",
        client_id: "app",
        refresh_token: token,
        ...changes,
      },
    }),
    new OAuth2Server.Response()
  )
}
async function authenticate(token: string, scope = "groups") {
  return createOAuthServer(store, "token").authenticate(
    new OAuth2Server.Request({
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      query: {},
    }),
    new OAuth2Server.Response(),
    { scope: [scope] }
  )
}
test("real authorization code, PKCE and protected data flow stores hashes only", async () => {
  const c = await authorize()
  expect(store.codes.has(c.authorizationCode)).toBe(false)
  const t = await exchange(c.authorizationCode)
  expect(store.tokens.has(t.accessToken)).toBe(false)
  expect((await authenticate(t.accessToken)).user.id).toBe("member")
  expect(store.tokens.has(hashSecret(t.accessToken))).toBe(true)
})
test("simultaneous code redemption has exactly one winner", async () => {
  const c = await authorize()
  const results = await Promise.allSettled([
    exchange(c.authorizationCode),
    exchange(c.authorizationCode),
  ])
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
})
test("wrong PKCE consumes code; replay cannot redeem it", async () => {
  const c = await authorize()
  await expect(
    exchange(c.authorizationCode, { code_verifier: "y".repeat(64) })
  ).rejects.toThrow()
  await expect(exchange(c.authorizationCode)).rejects.toThrow()
})
test("exact redirect, approved scopes and S256 are required", async () => {
  for (const changes of [
    { redirect_uri: "https://example.org/cb/evil" },
    { scope: "name" },
    { code_challenge_method: "plain" },
    { code_challenge: "" },
  ] as Record<string, string>[])
    await expect(authorize(changes)).rejects.toThrow()
})
test("refresh rotates once and cannot escalate scopes", async () => {
  const t = await exchange((await authorize()).authorizationCode)
  await expect(refresh(t.refreshToken!, { scope: "name" })).rejects.toThrow()
  const next = await refresh(t.refreshToken!)
  await expect(authenticate(t.accessToken)).rejects.toThrow()
  expect((await authenticate(next.accessToken)).user.id).toBe("member")
  await expect(refresh(t.refreshToken!)).rejects.toThrow()
  await expect(authenticate(next.accessToken)).rejects.toThrow()
  await expect(refresh(next.refreshToken!)).rejects.toThrow()
})
test("revocation, app suspension and scope removal deny existing tokens", async () => {
  const t = await exchange((await authorize()).authorizationCode)
  store.apps.get("app")!.enabled = false
  await expect(authenticate(t.accessToken)).rejects.toThrow()
  store.apps.get("app")!.enabled = true
  store.apps.get("app")!.approved_scopes = ["profile"]
  await expect(authenticate(t.accessToken)).rejects.toThrow()
  store.apps.get("app")!.approved_scopes = ["profile", "groups"]
  store.grants.delete("grant")
  await expect(authenticate(t.accessToken)).rejects.toThrow()
  await expect(refresh(t.refreshToken!)).rejects.toThrow()
})
test("confidential client cannot exchange without its secret", async () => {
  store.apps.get("app")!.client_type = "confidential"
  store.apps.get("app")!.secret_hash = hashSecret("test-secret")
  const c = await authorize()
  await expect(exchange(c.authorizationCode)).rejects.toThrow()
  await expect(
    exchange(c.authorizationCode, { client_secret: "wrong" })
  ).rejects.toThrow()
  expect(
    (await exchange(c.authorizationCode, { client_secret: "test-secret" }))
      .accessToken
  ).toBeTruthy()
})
test("a narrower code cannot inherit extra scopes from the consent grant", async () => {
  const c = await authorize({ scope: "profile" })
  const t = await exchange(c.authorizationCode)
  expect(t.scope).toEqual(["profile"])
  await expect(authenticate(t.accessToken, "groups")).rejects.toThrow()
})

test("HTTP token adapter supports form bodies and registered browser origins", async () => {
  const { tokenResponse } = await import("./http")
  const code = await authorize()
  const response = await tokenResponse(
    new Request("https://portal.test/api/developers/oauth/token", {
      method: "POST",
      headers: { Origin: "https://example.org" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "app",
        code: code.authorizationCode,
        redirect_uri: app.redirect_uris[0]!,
        code_verifier: verifier,
      }),
    }),
    store
  )
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(response.headers.get("access-control-allow-origin")).toBe(
    "https://example.org"
  )
  const body = await response.json()
  expect(body.token_type.toLowerCase()).toBe("bearer")
  expect(body.scope).toBe("profile groups")
  expect(body.client).toBeUndefined()
  expect(body.user).toBeUndefined()
})
test("HTTP adapter rejects unregistered origins and duplicate parameters without consuming code", async () => {
  const { tokenResponse } = await import("./http")
  const code = await authorize()
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "app",
    code: code.authorizationCode,
    redirect_uri: app.redirect_uris[0]!,
    code_verifier: verifier,
  })
  const badOrigin = await tokenResponse(
    new Request("https://portal.test/token", {
      method: "POST",
      headers: { Origin: "https://evil.test" },
      body,
    }),
    store
  )
  expect(badOrigin.status).toBe(400)
  expect(badOrigin.headers.has("access-control-allow-origin")).toBe(false)
  body.append("client_id", "app")
  expect(
    (
      await tokenResponse(
        new Request("https://portal.test/token", { method: "POST", body }),
        store
      )
    ).status
  ).toBe(400)
  expect((await exchange(code.authorizationCode)).accessToken).toBeTruthy()
})
test("HTTP revoke only revokes the authenticated client's grant and hides unknown tokens", async () => {
  const { revokeResponse } = await import("./http")
  const token = await exchange((await authorize()).authorizationCode)
  store.apps.set("other", { ...app, id: "other" })
  const revoke = (client: string, value: string) =>
    revokeResponse(
      new Request("https://portal.test/revoke", {
        method: "POST",
        body: new URLSearchParams({ client_id: client, token: value }),
      }),
      store,
      async (id) => {
        store.grants.delete(id)
      }
    )
  expect((await revoke("other", token.accessToken)).status).toBe(200)
  expect(store.grants.has("grant")).toBe(true)
  expect((await revoke("app", "not-a-token")).status).toBe(200)
  expect((await revoke("app", token.refreshToken!)).status).toBe(200)
  await expect(authenticate(token.accessToken)).rejects.toThrow()
})
test("authorization cannot substitute the grant's resource owner", async () => {
  const server = createOAuthServer(store, "authorize")
  await expect(
    server.authorize(
      new OAuth2Server.Request({
        method: "GET",
        headers: {},
        query: {
          client_id: "app",
          redirect_uri: app.redirect_uris[0],
          response_type: "code",
          state: "random",
          scope: "profile",
          code_challenge: challenge,
          code_challenge_method: "S256",
        },
      }),
      new OAuth2Server.Response(),
      {
        authenticateHandler: {
          handle: () => ({ id: "different-member", grantId: "grant" }),
        },
      }
    )
  ).rejects.toThrow()
})
test("expired authorization and refresh cannot be used", async () => {
  const c = await authorize()
  store.codes.get(hashSecret(c.authorizationCode))!.expires_at = new Date(
    0
  ).toISOString()
  await expect(exchange(c.authorizationCode)).rejects.toThrow()
  const t = await exchange((await authorize()).authorizationCode)
  store.tokens.get(hashSecret(t.accessToken))!.refresh_expires_at = new Date(
    0
  ).toISOString()
  await expect(refresh(t.refreshToken!)).rejects.toThrow()
})
test("replaying a rotated token with a different client cannot revoke the victim grant", async () => {
  const t = await exchange((await authorize()).authorizationCode)
  const next = await refresh(t.refreshToken!)
  store.apps.set("other", { ...app, id: "other" })
  await expect(
    refresh(t.refreshToken!, { client_id: "other" })
  ).rejects.toThrow()
  expect((await authenticate(next.accessToken)).user.id).toBe("member")
})
test("concurrent refresh reuse revokes the grant and any winning descendant", async () => {
  const t = await exchange((await authorize()).authorizationCode)
  const results = await Promise.allSettled([
    refresh(t.refreshToken!),
    refresh(t.refreshToken!),
  ])
  expect(
    results.filter((r) => r.status === "fulfilled").length
  ).toBeLessThanOrEqual(1)
  expect(store.grants.has("grant")).toBe(false)
  for (const result of results)
    if (result.status === "fulfilled")
      await expect(authenticate(result.value.accessToken)).rejects.toThrow()
})
