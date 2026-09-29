import type { McpServer } from "@modelcontextprotocol/server"
import { z } from "zod"

import { fetchAdminUsers, type AdminUser } from "@/lib/admin/fetch"
import {
  applyRoleChanges,
  KNOWN_ROLE_APPS,
  roleApps,
  sameRoles,
  updateUserRoles,
} from "@/lib/admin/roles"
import {
  failure,
  json,
  PORTAL_URL,
  requireCaller,
  requireAdmin,
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
        'The lab member directory with permissions (/admin): id, name, email, is_admin for portal super admins, and roles, a map of app name to role list such as {"trip": ["admin"]}. Portal super admins only — for anyone else the tool fails instead of returning a shorter list, because this is the whole membership and everyone\'s access. Roles are changed with update_member_roles.',
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
        await requireAdmin(
          supabase,
          "is_portal_admin",
          "list members and roles"
        )

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

  server.registerTool(
    "update_member_roles",
    {
      title: "Update member roles",
      description: `Changes what a member may administer, the 編輯權限 dialog on /admin: grant_admin makes them an admin of each listed app (${KNOWN_ROLE_APPS.join(", ")}, or any other app a member already holds a role in, spelled as stored), revoke_admin takes that away, and is_admin sets or clears portal super admin, which admits them to everything including this tool. Omitted fields stay as they are, and other roles in an app (such as a legacy "user") are kept. Portal super admins only; for anyone else the tool fails. A super admin cannot clear their own flag. Each call rewrites the member's whole role map, so put every change for one member into a single call and never call it twice at once for the same member; if another change lands in between, the tool fails and shows what is stored. A call that changes nothing writes nothing and returns changed: false. It takes effect on the member's next request, so confirm the member, each app and the direction with the caller first.`,
      inputSchema: z.object({
        user_id: z
          .string()
          .trim()
          .min(1)
          .describe("Member id from list_portal_users"),
        grant_admin: z
          .array(z.string().trim().min(1))
          .max(20)
          .default([])
          .describe('Apps to make them an admin of, e.g. ["trip"]'),
        revoke_admin: z
          .array(z.string().trim().min(1))
          .max(20)
          .default([])
          .describe("Apps whose admin role to take away"),
        is_admin: z
          .boolean()
          .optional()
          .describe("Portal super admin; omit to leave it unchanged"),
      }),
    },
    async ({ user_id, grant_admin, revoke_admin, is_admin }, ctx) => {
      try {
        const caller = requireCaller(ctx as ToolContext)
        if (
          grant_admin.length === 0 &&
          revoke_admin.length === 0 &&
          is_admin === undefined
        ) {
          throw new Error(
            "nothing to change: pass grant_admin, revoke_admin or is_admin"
          )
        }
        const supabase = createUserClient(caller.token)
        await requireAdmin(supabase, "is_portal_admin", "change roles")
        const users = await fetchAdminUsers(supabase)
        const target = users.find((u) => u.id === user_id)
        if (!target) {
          throw new Error(
            `no member with id ${user_id}; call list_portal_users for the ids`
          )
        }
        const isAdmin = is_admin ?? target.is_admin
        if (target.id === caller.userId && !isAdmin) {
          throw new Error(
            "a super admin cannot clear their own super admin flag; another super admin has to"
          )
        }
        const roles = applyRoleChanges(
          target.roles ?? {},
          { grant: grant_admin, revoke: revoke_admin },
          roleApps(users)
        )
        const before = { is_admin: target.is_admin, roles: target.roles ?? {} }
        if (isAdmin === target.is_admin && sameRoles(roles, before.roles)) {
          return json({
            changed: false,
            id: target.id,
            name: target.name,
            email: target.email,
            is_admin: before.is_admin,
            roles: before.roles,
            url: `${PORTAL_URL}/admin`,
          })
        }
        await updateUserRoles(supabase, {
          targetId: target.id,
          roles,
          isAdmin,
        })
        // The RPC replaces the whole map, so a change that raced this one can
        // undo it. Read back and report what is stored, and fail when it is
        // not what this call wrote.
        const stored = (await fetchAdminUsers(supabase)).find(
          (u) => u.id === target.id
        )
        const after = {
          is_admin: stored?.is_admin ?? null,
          roles: stored?.roles ?? {},
        }
        if (after.is_admin !== isAdmin || !sameRoles(after.roles, roles)) {
          throw new Error(
            `another change to this member landed at the same time, so this one may not have stuck; stored now: ${JSON.stringify(after)}. Check with list_portal_users and call again with every change for this member in one call.`
          )
        }
        return json({
          changed: true,
          id: target.id,
          name: target.name,
          email: target.email,
          before,
          after,
          url: `${PORTAL_URL}/admin`,
        })
      } catch (err) {
        return failure(err)
      }
    }
  )
}
