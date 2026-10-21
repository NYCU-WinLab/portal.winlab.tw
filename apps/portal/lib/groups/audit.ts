// lib/groups/audit.ts
// Every /groups add or remove, refused and failed ones included. Rows are
// inserted with the service-role client: the table has no insert policy, so
// a member can never write a row about something that did not happen.

import { MAX_EMAIL_LENGTH } from "@/lib/groups/email"
import type { MemberChangeResult } from "@/lib/groups/types"
import { createAdminClient } from "@/lib/supabase/admin"

const MAX_DETAIL_LENGTH = 500

// Postgres text can't hold U+0000, and one bad row fails the whole insert,
// taking every other row of that request with it. So control characters and
// lone surrogates go,
// and lengths are cut by code point — the way char_length() counts them, and
// without splitting a surrogate pair.
const CONTROL = /[\p{Cc}\p{Cs}]+/gu

function clip(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("")
}

export type AuditInsert = {
  actor_id: string
  /** The Directory group id. */
  group_id: string
  group_email: string
  member_email: string
  action: "add" | "remove"
  outcome: MemberChangeResult["outcome"]
  detail: string | null
}

export function buildAuditRow(
  actorId: string,
  group: { id: string; email: string },
  action: "add" | "remove",
  result: MemberChangeResult
): AuditInsert {
  const detail =
    result.detail ??
    (result.listedAs ? `listed by Google as ${result.listedAs}` : undefined)
  return {
    actor_id: actorId,
    group_id: group.id,
    group_email: clip(group.email.replace(CONTROL, ""), MAX_EMAIL_LENGTH),
    member_email: clip(result.email.replace(CONTROL, ""), MAX_EMAIL_LENGTH),
    action,
    outcome: result.outcome,
    detail: detail
      ? clip(detail.replace(CONTROL, " "), MAX_DETAIL_LENGTH)
      : null,
  }
}

// Never throws: the change already happened in Google, and a lost audit line
// must not turn it into an error toast. Failures go to the server console.
export async function recordMembershipChanges(
  rows: AuditInsert[]
): Promise<void> {
  if (rows.length === 0) return
  try {
    const { error } = await createAdminClient()
      .from("group_membership_audit")
      .insert(rows)
    if (error) console.error("[groups] audit insert failed", error, rows)
  } catch (err) {
    console.error("[groups] audit insert failed", err, rows)
  }
}
