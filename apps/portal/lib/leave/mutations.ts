import type { SupabaseClient } from "@supabase/supabase-js"

import type { Leave } from "@/lib/leave/types"

export type LeaveErrorCode = "duplicate" | "not_monday"

// The two Postgres constraints members actually hit (unique per user per
// Monday, and the Monday-only CHECK) carry a code so every caller can word the
// failure its own way while the message stays the one the UI already shows.
export class LeaveError extends Error {
  readonly code: LeaveErrorCode

  constructor(code: LeaveErrorCode, message: string) {
    super(message)
    this.name = "LeaveError"
    this.code = code
  }
}

// Signs one member up as absent from a Monday meeting. RLS accepts the row only
// when user_id is the caller. Shared by the browser hook and the MCP
// create_leave tool so both writers produce identical rows.
export async function createLeave(
  supabase: SupabaseClient,
  params: { user_id: string; date: string; reason: string }
): Promise<Leave> {
  const { data, error } = await supabase
    .from("leaves")
    .insert({
      user_id: params.user_id,
      date: params.date,
      reason: params.reason,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      throw new LeaveError("duplicate", "這一天已經請過假了")
    }
    if (error.code === "23514") {
      throw new LeaveError("not_monday", "請假日期只能選週一")
    }
    throw error
  }
  return data as Leave
}

export async function deleteLeave(
  supabase: SupabaseClient,
  leaveId: string
): Promise<void> {
  const { error } = await supabase.from("leaves").delete().eq("id", leaveId)
  if (error) throw error
}

// Deletes the member's own sign-up for one Monday and reports how many rows
// went. RLS scopes deletes to the caller's rows, so a 0 means there was nothing
// of theirs on that date.
export async function deleteLeaveOnDate(
  supabase: SupabaseClient,
  userId: string,
  date: string
): Promise<number> {
  const { data, error } = await supabase
    .from("leaves")
    .delete()
    .eq("user_id", userId)
    .eq("date", date)
    .select("id")

  if (error) throw error
  return ((data ?? []) as { id: string }[]).length
}
