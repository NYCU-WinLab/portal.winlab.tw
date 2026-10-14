"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/admin"
import { developerSession, ownedApplication } from "@/lib/developers/queries"
import { applicationInput } from "@/lib/developers/policy"
import { hashSecret, randomSecret } from "@/lib/developers/oauth"
import { databaseError } from "@/lib/developers/store"

export type ActionResult = {
  error?: string
  message?: string
  secret?: string
  id?: string
}
export async function manageApplication(
  _previous: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const { user, admin, db: sessionDb } = await developerSession()
  const db = createAdminClient()
  try {
    const operation = String(form.get("operation"))
    if (operation === "create") {
      const input = applicationInput.parse({
        name: form.get("name"),
        description: form.get("description"),
        contact_email: form.get("contact_email"),
        privacy_url: form.get("privacy_url"),
        client_type: form.get("client_type"),
        redirect_uris: String(form.get("redirect_uris"))
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      })
      const { count, error: countError } = await db
        .from("developer_apps")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id)
      databaseError(countError)
      if ((count ?? 0) >= 20)
        return { error: "每位成員最多可註冊 20 個應用程式。" }
      const secret =
        input.client_type === "confidential" ? randomSecret() : undefined
      const { data, error } = await db
        .from("developer_apps")
        .insert({
          ...input,
          owner_id: user.id,
          secret_hash: secret ? hashSecret(secret) : null,
        })
        .select("id")
        .single()
      databaseError(error)
      revalidatePath("/developers")
      return { message: "應用程式已建立。", id: String(data!.id), secret }
    }
    if (operation === "revoke-grant") {
      const id = z.uuid().parse(form.get("id"))
      const { error } = await db
        .from("developer_grants")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id)
      databaseError(error)
    } else if (operation === "review") {
      if (!admin) return { error: "只有 Portal 管理員可以審核。" }
      const id = z.uuid().parse(form.get("id"))
      const decision = z.enum(["approve", "reject"]).parse(form.get("decision"))
      const note = z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .parse(form.get("review_note"))
      const { error } = await sessionDb.rpc("developer_review_scope", {
        p_request: id,
        p_approve: decision === "approve",
        p_note: note,
      })
      databaseError(error)
    } else {
      const id = z.uuid().parse(form.get("id"))
      const app = await ownedApplication(id)
      if (!app) return { error: "找不到應用程式或沒有管理權限。" }
      if (operation === "request") {
        if (app.owner_id !== user.id)
          return { error: "只有應用程式擁有者可以提交申請。" }
        const scopes = z
          .array(z.enum(["name", "groups"]))
          .min(1)
          .parse(form.getAll("scopes"))
        const purpose = z
          .string()
          .trim()
          .min(10)
          .max(2000)
          .parse(form.get("purpose"))
        const { error } = await db
          .from("developer_scope_requests")
          .insert({ app_id: id, scopes: [...new Set(scopes)], purpose })
        if (error?.code === "23505")
          return { error: "這個應用程式已有待審核申請。" }
        databaseError(error)
      } else if (operation === "rotate") {
        if (app.client_type !== "confidential")
          return { error: "Public client 不使用 secret。" }
        const secret = randomSecret()
        const { error } = await db
          .from("developer_apps")
          .update({ secret_hash: hashSecret(secret) })
          .eq("id", id)
        databaseError(error)
        revalidatePath(`/developers/${id}`)
        return {
          message:
            "Secret 已更新，舊授權已撤銷。請立即保存，新 secret 只顯示這一次。",
          secret,
        }
      } else if (operation === "update") {
        const input = applicationInput.parse({
          name: form.get("name"),
          description: form.get("description"),
          contact_email: form.get("contact_email"),
          privacy_url: form.get("privacy_url"),
          client_type: app.client_type,
          redirect_uris: String(form.get("redirect_uris"))
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
        })
        const { error } = await db
          .from("developer_apps")
          .update(input)
          .eq("id", id)
        databaseError(error)
      } else if (
        operation === "disable" ||
        operation === "enable" ||
        operation === "revoke-scopes"
      ) {
        if (operation !== "disable" && !admin)
          return { error: "此操作需要 Portal 管理員權限。" }
        const change =
          operation === "revoke-scopes"
            ? { approved_scopes: ["profile"] }
            : { enabled: operation === "enable" }
        const { error } = await db
          .from("developer_apps")
          .update(change)
          .eq("id", id)
        databaseError(error)
      } else return { error: "不支援的操作。" }
    }
    revalidatePath("/developers", "layout")
    return { message: "已儲存。" }
  } catch (error) {
    if (error instanceof z.ZodError)
      return { error: error.issues[0]?.message ?? "請檢查輸入資料。" }
    return { error: "操作未完成，請稍後重試。" }
  }
}
