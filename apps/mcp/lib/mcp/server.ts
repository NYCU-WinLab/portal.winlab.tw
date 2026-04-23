import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { SupabaseClient } from "@supabase/supabase-js"
import { z } from "zod"

import { registerBentoTools } from "@/lib/mcp/tools/bento"

// One MCP server instance per request (stateless). The caller authenticates
// the user and hands us a Supabase client scoped to that user's bearer
// token — tools then run under that user's RLS context.
export function createMcpServer(supabase: SupabaseClient, userId: string) {
  const server = new McpServer({
    name: "winlab-portal-mcp",
    version: "0.0.1",
  })

  server.tool(
    "ping",
    "Sanity check that the MCP server is alive and recognises the caller.",
    {
      note: z.string().optional().describe("Optional note echoed back."),
    },
    async ({ note }) => {
      const { data } = await supabase
        .from("user_profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle()

      const who = data?.name ?? userId
      const ts = new Date().toISOString()
      const text = note
        ? `pong @ ${ts} — hi ${who}, you said: ${note}`
        : `pong @ ${ts} — hi ${who}`
      return { content: [{ type: "text", text }] }
    }
  )

  registerBentoTools(server, supabase, userId)

  return server
}
