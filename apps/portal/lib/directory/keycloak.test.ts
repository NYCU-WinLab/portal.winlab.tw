import { expect, test } from "bun:test"

import { fetchDirectoryUsers } from "./keycloak"

const env = {
  url: "https://idp.example",
  realm: "lab",
  clientId: "read",
  clientSecret: "unused",
}

test("reads all pages with custom attributes and no persistent fetch cache", async () => {
  const offsets: string[] = []
  const fetcher = async (input: string, init: RequestInit) => {
    const url = new URL(String(input))
    offsets.push(url.searchParams.get("first")!)
    expect(url.searchParams.get("briefRepresentation")).toBe("false")
    expect(init?.cache).toBe("no-store")
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer read-token"
    )
    const count = offsets.length === 1 ? 100 : 1
    return Response.json(
      Array.from({ length: count }, (_, i) => ({
        id: `${offsets.length}-${i}`,
      }))
    )
  }
  const users = await fetchDirectoryUsers(env, "read-token", fetcher)
  expect(users).toHaveLength(101)
  expect(offsets).toEqual(["0", "100"])
})

test("rejects partial results when a later page fails", async () => {
  let calls = 0
  const fetcher = async () => {
    if (calls++ === 0)
      return Response.json(
        Array.from({ length: 100 }, (_, i) => ({ id: String(i) }))
      )
    return new Response("forbidden", { status: 403 })
  }
  await expect(fetchDirectoryUsers(env, "read-token", fetcher)).rejects.toThrow(
    "keycloak get failed: 403"
  )
})
