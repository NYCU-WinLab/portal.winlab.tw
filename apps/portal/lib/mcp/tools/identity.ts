import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

export function registerIdentityTools(server: McpServer) {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description:
        'The signed-in portal member: id, email, display name, is_admin (portal super admin) and roles, a map of app name to role list such as {"trip": ["admin"]}. Call this first to learn whether the member administers an app before reading other tools\' results: receipts and trip admins see everyone\'s rows, other members only their own.',
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data, error } = await supabase
          .from("user_profiles")
          .select("name, is_admin, roles")
          .eq("id", caller.userId)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return json({
          id: caller.userId,
          email: caller.email,
          name: data?.name ?? caller.name,
          is_admin: data?.is_admin ?? false,
          roles: data?.roles ?? {},
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
