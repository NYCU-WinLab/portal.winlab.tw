import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/supabase/database.types"

import type { AdminUser } from "./fetch"

// Every app with an is_<app>_admin() wrapper in the database has to be listed
// here, or its role can only be granted by hand-editing user_profiles.roles.
export const KNOWN_ROLE_APPS = [
  "approve",
  "bento",
  "door",
  "leave",
  "meetings",
  "receipts",
  "reimburse",
  "trip",
]

// The apps /admin offers a role for: the known ones plus any a member holds.
export function roleApps(users: AdminUser[]): string[] {
  const set = new Set<string>(KNOWN_ROLE_APPS)
  users.forEach((u) => Object.keys(u.roles).forEach((k) => set.add(k)))
  return Array.from(set).sort()
}

export type RoleChanges = { grant?: string[]; revoke?: string[] }

// The admin half of the /admin dialog's edit, and nothing else: granting adds
// "admin" to the app's list, revoking takes "admin" out and drops the app
// once its list is empty. Any other role a member holds, such as a legacy
// "user", is left as it was.
export function applyRoleChanges(
  roles: Record<string, string[]>,
  changes: RoleChanges,
  apps: string[]
): Record<string, string[]> {
  const grant = changes.grant ?? []
  const revoke = changes.revoke ?? []
  const unknown = [...grant, ...revoke].filter((app) => !apps.includes(app))
  if (unknown.length > 0) {
    throw new Error(
      `no role for ${unknown.join(", ")}; the apps with roles are ${apps.join(", ")}`
    )
  }
  const both = grant.filter((app) => revoke.includes(app))
  if (both.length > 0) {
    throw new Error(`cannot both grant and revoke ${both.join(", ")}`)
  }
  const next: Record<string, string[]> = {}
  for (const [app, list] of Object.entries(roles)) {
    if (!revoke.includes(app)) {
      next[app] = list
      continue
    }
    const kept = (Array.isArray(list) ? list : []).filter(
      (role) => role !== "admin"
    )
    if (kept.length > 0) next[app] = kept
  }
  for (const app of grant) {
    const current = Array.isArray(next[app]) ? next[app] : []
    next[app] = current.includes("admin") ? current : [...current, "admin"]
  }
  return next
}

// Whether two role maps grant the same thing, whatever order the keys and
// lists are in.
export function sameRoles(
  a: Record<string, string[]>,
  b: Record<string, string[]>
): boolean {
  const canonical = (roles: Record<string, string[]>) =>
    JSON.stringify(
      Object.keys(roles)
        .sort()
        .map((app) => {
          const list = roles[app]
          return [app, Array.isArray(list) ? [...list].sort() : list]
        })
    )
  return canonical(a) === canonical(b)
}

// portal_admin_update_user replaces roles and is_admin wholesale. It is
// SECURITY DEFINER, refuses anyone but a portal super admin, and refuses a
// super admin clearing their own flag.
export async function updateUserRoles(
  supabase: SupabaseClient<Database>,
  params: {
    targetId: string
    roles: Record<string, string[]>
    isAdmin: boolean
  }
): Promise<void> {
  const { error } = await supabase.rpc("portal_admin_update_user", {
    p_target_id: params.targetId,
    p_roles: params.roles,
    p_is_admin: params.isAdmin,
  })
  if (error) throw error
}
