"use server"

import { revalidatePath } from "next/cache"

import {
  keycloakAdminConfigured,
  keycloakSubFromIdentities,
  updateKeycloakProfile,
} from "@/lib/profile/keycloak"
import { validateProfileUpdate } from "@/lib/profile/schema"
import { getCurrentAuthUser } from "@/lib/user"

export type UpdateProfileResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> }

export async function updateMyProfile(
  input: Record<string, unknown>
): Promise<UpdateProfileResult> {
  const user = await getCurrentAuthUser()
  if (!user) return { ok: false, errors: { _form: "Unauthenticated" } }

  // The target account is always derived from the session — never from the
  // client payload — so a caller can only ever edit their own profile.
  const sub = keycloakSubFromIdentities(user.identities)
  if (!sub)
    return {
      ok: false,
      errors: { _form: "此帳號沒有連結的 Keycloak 身分。" },
    }
  if (!keycloakAdminConfigured())
    return {
      ok: false,
      errors: { _form: "伺服器尚未設定 Keycloak 管理憑證。" },
    }

  const validated = validateProfileUpdate(input)
  if (!validated.ok) return { ok: false, errors: validated.errors }
  if (Object.keys(validated.value).length === 0) return { ok: true }

  try {
    await updateKeycloakProfile(sub, validated.value)
  } catch (err) {
    console.error("[profile] keycloak update failed", err)
    return { ok: false, errors: { _form: "更新失敗,請稍後再試。" } }
  }

  revalidatePath("/profile")
  return { ok: true }
}
