import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

// Factory builds a fresh MCP server per request (stateless). Auth and
// per-user tool registration are added in later commits.
export function createMcpServer() {
  const server = new McpServer({
    name: "winlab-portal-mcp",
    version: "0.0.1",
  })

  server.tool(
    "ping",
    "Sanity check that the MCP server is alive. Returns pong with a timestamp.",
    {
      note: z.string().optional().describe("Optional note echoed back."),
    },
    async ({ note }) => {
      const ts = new Date().toISOString()
      const text = note ? `pong @ ${ts} — ${note}` : `pong @ ${ts}`
      return { content: [{ type: "text", text }] }
    }
  )

  return server
}
