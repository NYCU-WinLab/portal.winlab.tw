// Which Teams meeting a cancelled booking should take down, if any.
//
// Split from lib/rooms/confirm.ts so the decision can be tested without
// Supabase or the pipeline: confirm.ts fetches a booking's create requests and
// acts on what this returns.

import type { Database } from "@/lib/supabase/database.types"

export type CreateRequestRow = Pick<
  Database["public"]["Tables"]["rooms_meeting_requests"]["Row"],
  "request_id" | "cancel_id" | "message_id" | "status"
>

export type CancelTarget =
  /** Nothing was ever meant to exist, so there's nothing to say. */
  | { kind: "none" }
  /** A meeting may exist that nothing here can name. */
  | { kind: "warn"; message: string }
  | {
      kind: "cancel"
      requestId: string
      cancelId: string
      messageId: string
    }

/**
 * @param pipelineConfigured false when this deployment has no trigger token,
 *   so it never asked for a meeting in the first place.
 * @param requests the booking's `kind = "create"` requests, newest first.
 */
export function decideCancelTarget({
  pipelineConfigured,
  requests,
}: {
  pipelineConfigured: boolean
  requests: readonly CreateRequestRow[]
}): CancelTarget {
  if (!pipelineConfigured) return { kind: "none" }

  // Newest first, so the latest meeting that reported both ids wins.
  const created = requests.find((r) => r.cancel_id && r.message_id)
  if (created?.cancel_id && created.message_id) {
    return {
      kind: "cancel",
      requestId: created.request_id,
      cancelId: created.cancel_id,
      messageId: created.message_id,
    }
  }

  // Pending, or reported success without the ids a cancel needs: a meeting
  // may exist (or still appear). No requests, or only failed ones, means
  // there's no meeting to take down.
  if (requests.some((r) => r.status !== "failed")) {
    return {
      kind: "warn",
      message: "Teams 會議尚未建立完成或沒有回報會議識別碼",
    }
  }
  return { kind: "none" }
}
