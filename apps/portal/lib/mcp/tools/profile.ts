import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"
import { fetchProfileStats } from "@/lib/profile/fetch"
import {
  getProfileFields,
  type ProfileFieldsResult,
} from "@/lib/profile/keycloak"

export type KeycloakAccount = {
  chinese_name: string | null
  first_name: string | null
  last_name: string | null
  phone: string | null
  position: string | null
  gitlab_username: string | null
  student_id: string | null
}

// Keycloak stores an absent attribute as the empty string once the field
// exists on the realm's user profile, which would read as "their name is
// nothing"; null says "not filled in".
export function keycloakAccount(
  result: ProfileFieldsResult
): KeycloakAccount | null {
  if (result.status !== "ok") return null
  const p = result.profile
  const value = (raw: string) => (raw.length > 0 ? raw : null)
  return {
    chinese_name: value(p.chinese_name),
    first_name: value(p.firstName),
    last_name: value(p.lastName),
    phone: value(p.phone),
    position: value(p.position),
    gitlab_username: value(p.gitlabUsername),
    student_id: value(p.student_id),
  }
}

export function registerProfileTools(server: McpServer) {
  server.registerTool(
    "get_profile",
    {
      title: "Get profile",
      description:
        "The member's own /profile page as data: their Keycloak account fields (Chinese name, English name, student id, phone, position, GitLab username) plus the portal activity stats that page shows — bento orders and spending, leave days taken, approve documents created and signed with the average signing delay, and trip files uploaded. Self only, and not a directory: get_profile_stats returns nothing for any user id but the caller's, so there is no way to read another member's profile here. keycloak is null when the member has no Keycloak identity or the IdP is unreachable, and the stats still come back.",
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const stats = await fetchProfileStats(supabase, caller.userId)
        const account: ProfileFieldsResult = caller.keycloakSub
          ? await getProfileFields(caller.keycloakSub)
          : { status: "unconfigured" }
        return json({
          user_id: caller.userId,
          url: `${PORTAL_URL}/profile`,
          keycloak: keycloakAccount(account),
          stats,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
