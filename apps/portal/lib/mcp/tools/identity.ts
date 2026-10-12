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
        const [profile, access] = await Promise.all([
          supabase
            .from("user_profiles")
            .select("name")
            .eq("id", caller.userId)
            .maybeSingle(),
          supabase.rpc("get_my_access").maybeSingle(),
        ])
        if (profile.error) throw new Error(profile.error.message)
        if (access.error) throw new Error(access.error.message)
        return json({
          id: caller.userId,
          email: caller.email,
          name: profile.data?.name ?? caller.name,
          is_admin: access.data?.is_admin ?? false,
          roles: access.data?.roles ?? {},
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
