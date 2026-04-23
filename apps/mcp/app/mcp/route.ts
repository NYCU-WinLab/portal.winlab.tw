import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { createMcpServer } from "@/lib/mcp/server"

export const dynamic = "force-dynamic"

// Stateless Streamable HTTP — one MCP server instance per request.
// Auth (bearer token check + user lookup) is added in a later commit.
export async function POST(request: Request) {
  const server = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
  await server.connect(transport)
  return transport.handleRequest(request)
}

export async function GET() {
  return Response.json(
    { error: "SSE not supported in stateless mode" },
    { status: 405 }
  )
}

export async function DELETE() {
  return Response.json(
    { error: "Sessions not supported in stateless mode" },
    { status: 405 }
  )
}
