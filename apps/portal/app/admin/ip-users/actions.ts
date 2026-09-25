"use server"

import { revalidatePath } from "next/cache"

import {
  deleteIpUserInput,
  ipUserInput,
  ipUserError,
} from "@/lib/admin/ip-users"
import {
  IpUserAccessError,
  requireIpUserAdmin,
} from "@/lib/admin/ip-users-server"

export type IpUserResult = { ok: true } | { ok: false; error: string }

export async function saveIpUser(input: unknown): Promise<IpUserResult> {
  try {
    const supabase = await requireIpUserAdmin()
    const parsed = ipUserInput.safeParse(input)
    if (!parsed.success)
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "請確認輸入內容",
      }
    const row = parsed.data
    const { error } = await supabase.rpc("save_ip_user_entry", {
      p_id: row.id,
      p_ip: row.ip,
      p_user_name: row.user_name,
      p_category: row.category,
      p_notes: row.notes,
      p_expected_revision: row.expected_revision,
    })
    if (error) return { ok: false, error: ipUserError(error) }
    revalidatePath("/admin/ip-users")
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof IpUserAccessError
          ? error.message
          : "儲存失敗，請稍後再試",
    }
  }
}

export async function deleteIpUser(input: unknown): Promise<IpUserResult> {
  try {
    const supabase = await requireIpUserAdmin()
    const parsed = deleteIpUserInput.safeParse(input)
    if (!parsed.success)
      return { ok: false, error: "資料版本不正確，請重新整理" }
    const { error } = await supabase.rpc("delete_ip_user_entry", {
      p_id: parsed.data.id,
      p_expected_revision: parsed.data.expected_revision,
    })
    if (error) return { ok: false, error: ipUserError(error) }
    revalidatePath("/admin/ip-users")
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof IpUserAccessError
          ? error.message
          : "刪除失敗，請稍後再試",
    }
  }
}
