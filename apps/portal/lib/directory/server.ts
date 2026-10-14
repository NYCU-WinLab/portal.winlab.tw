import "server-only"

import { redirect } from "next/navigation"

import { loginUrlFor } from "@/lib/auth/safe-next"
import {
  adminToken,
  keycloakEnv,
  KeycloakAdminError,
} from "@/lib/keycloak/admin"
import { getCurrentAuthUser } from "@/lib/user"

import { fetchDirectoryUsers } from "./keycloak"
import { isListed, toDirectoryMember, type DirectoryMember } from "./members"

export type DirectoryResult =
  | { status: "ok"; members: DirectoryMember[] }
  | { status: "unavailable" }

// Auth is checked on every call, including before returning cached PII.
let cached: { expiresAt: number; members: DirectoryMember[] } | undefined

export async function getDirectoryMembers(): Promise<DirectoryResult> {
  const user = await getCurrentAuthUser()
  if (!user) redirect(loginUrlFor("/directory"))

  const env = keycloakEnv()
  if (!env) return { status: "unavailable" }
  if (cached && cached.expiresAt > Date.now()) {
    return { status: "ok", members: cached.members }
  }

  try {
    const token = await adminToken(env)
    const users = await fetchDirectoryUsers(env, token)

    const listed = users.filter(isListed)
    const unrecognised = new Map<string, string>()
    const members = listed
      .map((member) => toDirectoryMember(member, unrecognised))
      .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"))

    if (unrecognised.size > 0) {
      console.warn("[directory] Unrecognised member roles", {
        count: unrecognised.size,
      })
    }
    cached = { expiresAt: Date.now() + 5 * 60 * 1000, members }
    return { status: "ok", members }
  } catch (error) {
    // Do not log Keycloak response bodies or personal contact details.
    console.error("[directory] Keycloak read failed", {
      status: error instanceof KeycloakAdminError ? error.status : undefined,
    })
    return { status: "unavailable" }
  }
}
