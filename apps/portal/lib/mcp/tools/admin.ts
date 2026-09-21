import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { fetchAdminUsers, type AdminUser } from "@/lib/admin/fetch"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  type ToolContext,
} from "@/lib/mcp/context"
import { createUserClient } from "@/lib/mcp/supabase"

export type AdminUserFilter = {
  roleApp?: string
  adminsOnly?: boolean
  query?: string
}

function rolesOf(user: AdminUser, app: string): string[] {
  const key = Object.keys(user.roles).find(
    (k) => k.toLowerCase() === app.toLowerCase()
  )
  return key ? (user.roles[key] ?? []) : []
}

function isAdminSomewhere(user: AdminUser, roleApp?: string): boolean {
  if (user.is_admin) return true
  const lists = roleApp
    ? [rolesOf(user, roleApp)]
    : Object.values(user.roles ?? {})
  return lists.some((roles) => roles.includes("admin"))
}

export function filterAdminUsers(
  users: AdminUser[],
  filter: AdminUserFilter
): AdminUser[] {
  const needle = filter.query?.trim().toLowerCase()
  return users.filter((user) => {
    if (filter.roleApp && rolesOf(user, filter.roleApp).length === 0) {
      return false
    }
    if (filter.adminsOnly && !isAdminSomewhere(user, filter.roleApp)) {
      return false
    }
    if (needle) {
      const haystack = `${user.name ?? ""} ${user.email}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }
    return true
  })
}

export function registerAdminTools(server: McpServer) {
  server.registerTool(
    "list_portal_users",
    {
      title: "List portal users",
      description:
        'The lab member directory with permissions (/admin): id, name, email, is_admin for portal super admins, and roles, a map of app name to role list such as {"trip": ["admin"]}. Portal super admins only — for anyone else the tool fails instead of returning a shorter list, because this is the whole membership and everyone\'s access. Read only: granting or removing a role stays a deliberate click on https://portal.winlab.tw/admin and has no tool.',
      inputSchema: z.object({
        role_app: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Only members holding a role in this app, e.g. "trip"'),
        admins_only: z
          .boolean()
          .optional()
          .describe(
            "Only portal super admins and members whose role list includes admin"
          ),
        query: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Case-insensitive substring of the name or email"),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    },
    async ({ role_app, admins_only, query, limit }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        const supabase = createUserClient(caller.token)
        const { data: isAdmin, error } = await supabase.rpc("is_portal_admin")
        if (error) throw new Error(error.message)
        if (isAdmin !== true) {
          return failure(
            new Error("only portal admins can list members and roles")
          )
        }

        const matched = filterAdminUsers(await fetchAdminUsers(supabase), {
          roleApp: role_app,
          adminsOnly: admins_only,
          query,
        })
        const users = matched.slice(0, limit)
        return json({
          count: users.length,
          total_matched: matched.length,
          url: `${PORTAL_URL}/admin`,
          users: users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            is_admin: u.is_admin,
            roles: u.roles ?? {},
          })),
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
