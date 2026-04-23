import { createMcpHandler } from "mcp-handler"
import { z } from "zod"

const handler = createMcpHandler(
  (server) => {
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
  },
  {},
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
    redisUrl: process.env.REDIS_URL,
  }
)

export { handler as GET, handler as POST, handler as DELETE }
