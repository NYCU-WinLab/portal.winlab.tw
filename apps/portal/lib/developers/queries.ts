import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { APP_COLUMNS, databaseError } from "./store"
import type { Application, Grant, ScopeRequest } from "./types"
import { approvedScopes, authorizeInput } from "./policy"

export async function developerSession() {
  const db = await createClient()
  const {
    data: { user },
    error,
  } = await db.auth.getUser()
  if (error || !user) redirect("/auth/login?next=/developers")
  const { data: admin, error: adminError } = await db.rpc("is_portal_admin")
  databaseError(adminError)
  return { user, admin: admin === true, db }
}
export async function myApplications() {
  const { user } = await developerSession()
  const { data, error } = await createAdminClient()
    .from("developer_apps")
    .select(APP_COLUMNS)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
  databaseError(error)
  return data as Omit<Application, "secret_hash">[]
}
export async function ownedApplication(id: string) {
  const { user, admin } = await developerSession()
  const db = createAdminClient()
  let query = db.from("developer_apps").select(APP_COLUMNS).eq("id", id)
  if (!admin) query = query.eq("owner_id", user.id)
  const { data, error } = await query.maybeSingle()
  databaseError(error)
  return data as Omit<Application, "secret_hash"> | null
}
export async function scopeRequests(appId?: string, page = 0) {
  const { admin } = await developerSession()
  const db = createAdminClient()
  if (appId) {
    if (!(await ownedApplication(appId))) return []
  } else if (!admin) return []
  let query = db
    .from("developer_scope_requests")
    .select("*")
    .order("created_at", { ascending: !appId })
    .range(appId ? 0 : page * 50, appId ? 99 : page * 50 + 49)
  if (appId) query = query.eq("app_id", appId)
  else query = query.eq("status", "pending")
  const { data, error } = await query
  databaseError(error)
  return data as ScopeRequest[]
}
export async function myGrants() {
  const { user } = await developerSession()
  const db = createAdminClient()
  const { data, error } = await db
    .from("developer_grants")
    .select("*,developer_apps(name)")
    .eq("user_id", user.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
  databaseError(error)
  return data as (Grant & { developer_apps: { name: string } })[]
}
export async function authorizationDetails(raw: unknown) {
  const input = authorizeInput.parse(raw)
  const { data, error } = await createAdminClient()
    .from("developer_apps")
    .select(APP_COLUMNS)
    .eq("id", input.client_id)
    .maybeSingle()
  databaseError(error)
  const app = data as Omit<Application, "secret_hash"> | null
  if (!app?.enabled || !app.redirect_uris.includes(input.redirect_uri))
    throw new Error("無效或已停用的應用程式／回呼網址")
  const scopes = approvedScopes(
    input.scope.split(" ").filter(Boolean),
    app.approved_scopes
  )
  if (!scopes) throw new Error("應用程式尚未獲准使用這些資料權限")
  return { app, input, scopes }
}
