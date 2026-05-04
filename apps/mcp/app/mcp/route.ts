import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { getProtectedResourceMetadataUrl } from "@/lib/auth/urls"
import { createMcpServer } from "@/lib/mcp/server"
import { createClientWithToken } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) return unauthorized("Missing Authorization header")

  const supabase = createClientWithToken(token)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return unauthorized("Invalid or expired token")

  const server = createMcpServer(supabase, user.id)
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

function unauthorized(message: string) {
  return Response.json(
    { error: message },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${getProtectedResourceMetadataUrl()}"`,
      },
    }
  )
}
