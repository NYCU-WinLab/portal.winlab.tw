import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { createAdminClient } from "@/lib/supabase/admin"
import { applicationInput } from "./policy"
import { hashSecret, randomSecret } from "./oauth"
import { databaseError } from "./store"

export class DeveloperActionError extends Error {}

export const scopeRequestInput = z.object({
  app_id: z.uuid(),
  scopes: z
    .array(z.enum(["name", "groups"]))
    .min(1)
    .max(2),
  purpose: z.string().trim().min(10).max(2000),
})

// Both callers authenticate before reaching this boundary: web session or MCP bearer.
export async function registerApplicationFor(userId: string, raw: unknown) {
  const input = applicationInput.parse(raw)
  const db = createAdminClient()
  const { count, error: countError } = await db
    .from("developer_apps")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
  databaseError(countError)
  if ((count ?? 0) >= 20)
    throw new DeveloperActionError("每位成員最多可註冊 20 個應用程式。")
  const secret =
    input.client_type === "confidential" ? randomSecret() : undefined
  const { data, error } = await db
    .from("developer_apps")
    .insert({
      ...input,
      owner_id: userId,
      secret_hash: secret ? hashSecret(secret) : null,
    })
    .select("id")
    .single()
  databaseError(error)
  return { id: String(data!.id), secret }
}

export async function requestScopesFor(
  userDb: SupabaseClient<Database>,
  userId: string,
  raw: unknown
) {
  const input = scopeRequestInput.parse(raw)
  const { data: app, error: readError } = await userDb
    .from("developer_apps")
    .select("id")
    .eq("id", input.app_id)
    .eq("owner_id", userId)
    .maybeSingle()
  databaseError(readError)
  if (!app) throw new DeveloperActionError("找不到應用程式或你不是擁有者。")
  const { error } = await createAdminClient()
    .from("developer_scope_requests")
    .insert({ ...input, scopes: [...new Set(input.scopes)] })
  if (error?.code === "23505")
    throw new DeveloperActionError("這個應用程式已有待審核申請。")
  databaseError(error)
}
