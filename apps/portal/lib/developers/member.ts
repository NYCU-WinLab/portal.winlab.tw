import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { keycloakSubFromIdentities } from "@/lib/profile/keycloak"
import { adminRealmUrl, adminToken, keycloakEnv } from "@/lib/keycloak/admin"
import { memberGroups, profileResponse, type Scope } from "./policy"

const memberSchema = z.object({
  username: z.string(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  enabled: z.boolean(),
  attributes: z.record(z.string(), z.array(z.string())).optional(),
})
const groupsSchema = z.array(z.object({ name: z.string(), path: z.string() }))

export async function readMemberData(userId: string, scope: Scope) {
  const { data, error } =
    await createAdminClient().auth.admin.getUserById(userId)
  if (error || !data.user) throw new Error("Member unavailable")
  const sub = keycloakSubFromIdentities(data.user.identities)
  const env = keycloakEnv()
  if (!sub || !env) throw new Error("Member source unavailable")
  const token = await adminToken(env)
  const url = `${adminRealmUrl(env)}/users/${encodeURIComponent(sub)}`
  async function get(suffix: string) {
    const response = await fetch(`${url}${suffix}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error("Member source unavailable")
    return response.json() as Promise<unknown>
  }
  return readIdentity(scope, get)
}

export async function readIdentity(
  scope: Scope,
  get: (suffix: string) => Promise<unknown>
) {
  const member = memberSchema.parse(await get(""))
  if (!member.enabled) throw new Error("Member unavailable")
  if (scope === "profile") return profileResponse(member)
  if (scope === "name")
    return {
      username: member.username,
      name:
        member.attributes?.chinese_name?.[0] ||
        [member.firstName, member.lastName].filter(Boolean).join(" ") ||
        null,
    }
  const groups: z.infer<typeof groupsSchema> = []
  for (let first = 0; ; first += 100) {
    const page = groupsSchema.parse(await get(`/groups?first=${first}&max=100`))
    groups.push(...page)
    if (page.length < 100) break
  }
  return { username: member.username, groups: memberGroups(groups) }
}
