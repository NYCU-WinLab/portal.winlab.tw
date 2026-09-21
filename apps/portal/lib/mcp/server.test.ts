import { describe, expect, test } from "bun:test"
import { createMcpHandler, withMcpAuth } from "mcp-handler"

import { MCP_SERVER_INFO, registerTools } from "@/lib/mcp/server"

const ENDPOINT = "https://portal.example/api/mcp"
const TOKEN = "test-token"

const handler = withMcpAuth(
  createMcpHandler((server) => registerTools(server), {
    serverInfo: MCP_SERVER_INFO,
  }),
  async (_req, bearer) =>
    bearer === TOKEN
      ? { token: bearer, clientId: "u1", scopes: [], extra: { userId: "u1" } }
      : undefined,
  { required: true }
)

function rpc(method: string, params: unknown = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params }
}

async function call(body: unknown, token?: string): Promise<Response> {
  return handler(
    new Request(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
  )
}

// Stateless servers may answer as plain JSON or as a one-message SSE stream.
async function readRpcResult(res: Response): Promise<unknown> {
  const text = await res.text()
  const type = res.headers.get("content-type") ?? ""
  if (type.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("")
    return JSON.parse(data)
  }
  return JSON.parse(text)
}

describe("portal MCP handler", () => {
  test("challenges unauthenticated requests with resource metadata", async () => {
    const res = await call(rpc("tools/list"))
    expect(res.status).toBe(401)
    const challenge = res.headers.get("www-authenticate") ?? ""
    expect(challenge).toContain("Bearer")
    expect(challenge).toContain(
      "https://portal.example/.well-known/oauth-protected-resource"
    )
  })

  test("rejects a bad token", async () => {
    const res = await call(rpc("tools/list"), "nope")
    expect(res.status).toBe(401)
  })

  test("lists the receipts tools for an authenticated caller", async () => {
    const res = await call(
      rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      }),
      TOKEN
    )
    expect(res.status).toBe(200)

    const listed = await call(rpc("tools/list", {}, 2), TOKEN)
    expect(listed.status).toBe(200)
    const body = (await readRpcResult(listed)) as {
      result: { tools: { name: string }[] }
    }
    const names = body.result.tools.map((t) => t.name).sort()
    expect(names).toEqual(["list_receipts", "upload_receipt", "whoami"])
  })
})
