import { describe, expect, test } from "bun:test"

import {
  getOAuthClient,
  getRedirectUriMatch,
  registerOAuthClient,
  type OAuthClientRow,
  type OAuthClientStore,
} from "@/lib/auth/oauth-clients"

function fakeStore(seed: OAuthClientRow[] = []) {
  const rows: OAuthClientRow[] = [...seed]
  const store: OAuthClientStore = {
    async insert(row) {
      rows.push(row)
    },
    async selectById(clientId) {
      return rows.find((r) => r.client_id === clientId) ?? null
    },
  }
  return { store, rows }
}

const sampleClient: OAuthClientRow = {
  client_id: "client-abc",
  client_name: "Test Client",
  redirect_uris: ["https://app.example.com/callback"],
  grant_types: ["authorization_code"],
  response_types: ["code"],
}

describe("registerOAuthClient", () => {
  test("forces token_endpoint_auth_method to 'none' (public client)", async () => {
    const { store } = fakeStore()
    const client = await registerOAuthClient(
      { redirect_uris: ["https://app.example.com/callback"] },
      store
    )
    expect(client.token_endpoint_auth_method).toBe("none")
  })

  test("defaults grant_types, response_types and client_name", async () => {
    const { store } = fakeStore()
    const client = await registerOAuthClient(
      { redirect_uris: ["https://app.example.com/callback"] },
      store
    )

    expect(client.grant_types).toEqual(["authorization_code", "refresh_token"])
    expect(client.response_types).toEqual(["code"])
    expect(client.client_name).toBe("MCP Client")
  })

  test("generates a UUID client_id", async () => {
    const { store } = fakeStore()
    const client = await registerOAuthClient(
      { redirect_uris: ["https://app.example.com/callback"] },
      store
    )
    expect(client.client_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  test("honours an explicit client_name and grant_types", async () => {
    const { store } = fakeStore()
    const client = await registerOAuthClient(
      {
        client_name: "My App",
        redirect_uris: ["https://app.example.com/callback"],
        grant_types: ["authorization_code"],
      },
      store
    )
    expect(client.client_name).toBe("My App")
    expect(client.grant_types).toEqual(["authorization_code"])
  })

  test("persists the client (with created_at) via the store", async () => {
    const { store, rows } = fakeStore()
    const client = await registerOAuthClient(
      { redirect_uris: ["https://app.example.com/callback"] },
      store
    )

    expect(rows).toHaveLength(1)
    expect(rows[0]!.client_id).toBe(client.client_id)
    expect(typeof rows[0]!.created_at).toBe("string")
  })

  test("returned object does not carry created_at (only the stored row does)", async () => {
    const { store } = fakeStore()
    const client = await registerOAuthClient(
      { redirect_uris: ["https://app.example.com/callback"] },
      store
    )
    expect("created_at" in client).toBe(false)
  })

  test("rejects registration with no redirect_uris", async () => {
    const { store } = fakeStore()
    await expect(
      registerOAuthClient({ redirect_uris: [] }, store)
    ).rejects.toThrow()
  })

  test("rejects a non-URL redirect_uri", async () => {
    const { store } = fakeStore()
    await expect(
      registerOAuthClient({ redirect_uris: ["not-a-url"] }, store)
    ).rejects.toThrow()
  })
})

describe("getOAuthClient", () => {
  test("returns the row from the store when present", async () => {
    const { store } = fakeStore([sampleClient])
    const client = await getOAuthClient("client-abc", store)
    expect(client?.client_id).toBe("client-abc")
  })

  test("returns null when the client is unknown", async () => {
    const { store } = fakeStore([sampleClient])
    expect(await getOAuthClient("nope", store)).toBeNull()
  })
})

describe("getRedirectUriMatch", () => {
  test("returns the redirect_uri on an exact allowlist match", async () => {
    const { store } = fakeStore([sampleClient])
    const match = await getRedirectUriMatch(
      "client-abc",
      "https://app.example.com/callback",
      store
    )
    expect(match).toBe("https://app.example.com/callback")
  })

  test("returns null on a trailing-slash mismatch (exact match only)", async () => {
    const { store } = fakeStore([sampleClient])
    const match = await getRedirectUriMatch(
      "client-abc",
      "https://app.example.com/callback/",
      store
    )
    expect(match).toBeNull()
  })

  test("returns null when the client is unknown", async () => {
    const { store } = fakeStore([sampleClient])
    const match = await getRedirectUriMatch(
      "missing",
      "https://app.example.com/callback",
      store
    )
    expect(match).toBeNull()
  })
})
