import { createAdminClient } from "@/lib/supabase/admin"
import type { Application, Code, Grant, OAuthStore, TokenPair } from "./types"

export const APP_COLUMNS =
  "id,owner_id,name,description,contact_email,privacy_url,client_type,redirect_uris,approved_scopes,enabled,created_at"
export function databaseError(error: { message: string } | null) {
  if (error) throw new Error("Developer service database operation failed")
}
export function createOAuthStore(): OAuthStore {
  const db = createAdminClient()
  return {
    async app(id) {
      const { data, error } = await db
        .from("developer_apps")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      databaseError(error)
      return data as Application | null
    },
    async grant(id) {
      const { data, error } = await db
        .from("developer_grants")
        .select("*")
        .eq("id", id)
        .maybeSingle()
      databaseError(error)
      return data as Grant | null
    },
    async code(hash) {
      const { data, error } = await db
        .from("developer_codes")
        .select("*")
        .eq("hash", hash)
        .maybeSingle()
      databaseError(error)
      return data as Code | null
    },
    async saveCode(code) {
      const { error } = await db.from("developer_codes").insert(code)
      databaseError(error)
    },
    async consumeCode(hash) {
      const { data, error } = await db
        .from("developer_codes")
        .delete()
        .eq("hash", hash)
        .select("hash")
      databaseError(error)
      return data?.length === 1
    },
    async token(hash, kind) {
      const { data, error } = await db
        .from("developer_tokens")
        .select("*")
        .eq(kind === "access" ? "access_hash" : "refresh_hash", hash)
        .maybeSingle()
      databaseError(error)
      return data as TokenPair | null
    },
    async saveToken(token) {
      const { error } = await db.from("developer_tokens").insert(token)
      databaseError(error)
    },
    async consumeRefresh(hash) {
      const { data, error } = await db.rpc("developer_consume_refresh", {
        p_hash: hash,
      })
      databaseError(error)
      return data === true
    },
  }
}
