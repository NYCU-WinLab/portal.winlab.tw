// lib/groups/failure.ts
// Turning what went wrong into something a group manager can act on. Two
// failures are not about any one address: Google refusing the service
// account (401/403 — its admin role, the API or WIF is wrong) and no token
// at all. Those stop a batch and are shown as such, never as an empty list
// or as N separate per-address errors.

import {
  GoogleGroupsError,
  GroupsCredentialError,
  isRateLimited,
} from "@/lib/groups/google"
import type { GroupsResult } from "@/lib/groups/types"

export const PERMISSION_MESSAGE =
  "portal 的 Google 服務帳號沒有權限操作群組（admin 角色、API 或 WIF 設定有誤），請通知 portal 管理員。"

export function isFatal(err: unknown): boolean {
  return (
    err instanceof GroupsCredentialError ||
    (err instanceof GoogleGroupsError &&
      (err.status === 401 || err.status === 403) &&
      !isRateLimited(err))
  )
}

export const RATE_LIMIT_MESSAGE = "Google 暫時限流，請稍後再試"

export function describeError(err: unknown): string {
  if (isRateLimited(err)) return RATE_LIMIT_MESSAGE
  if (err instanceof GoogleGroupsError)
    return `Google ${err.status}${err.detail ? `：${err.detail}` : ""}`
  return err instanceof Error ? err.message : "unknown"
}

export function failure(err: unknown): GroupsResult<never> {
  if (err instanceof GroupsCredentialError)
    return { status: "error", detail: err.message }
  if (isFatal(err))
    return {
      status: "forbidden",
      reason: "google_permission",
      detail: `${PERMISSION_MESSAGE}（${describeError(err)}）`,
    }
  return { status: "error", detail: describeError(err) }
}
