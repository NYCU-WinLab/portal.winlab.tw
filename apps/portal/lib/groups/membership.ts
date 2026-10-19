// lib/groups/membership.ts
// The read / add / remove flows behind app/groups/actions.ts, with
// everything they talk to passed in: the member's is_group_manager() check,
// the Directory API and the audit sink. actions.ts only wires in the real
// ones, so the order of checks is tested here with fakes:
//
//   1. Input first. A server action takes whatever a forged request sends,
//      so anything the UI never sends — a non-string, an over-long string,
//      an address normalizeEmail refuses — rejects the whole request with no
//      Google call and no audit row, as a malformed group id does. It is
//      logged instead: who sent it and which check failed, never the content.
//   2. is_group_manager() before Google: a non-manager never causes a call.
//   3. Google's own address for the group decides gcp-* and the domain.
//   4. Every write attempt past (1) is audited, handed to the sink once, in
//      `finally`: a row per address tried, one row for a refusal however
//      many addresses it carried, one row when authorisation itself failed.

import { buildAuditRow, type AuditInsert } from "@/lib/groups/audit"
import { authorizeGroup } from "@/lib/groups/authorize"
import { mapLimited } from "@/lib/groups/batch"
import { MAX_EMAIL_LENGTH, normalizeEmail } from "@/lib/groups/email"
import { describeError, failure, isFatal } from "@/lib/groups/failure"
import {
  addMember,
  getGroup,
  listMembers,
  removeMember,
  type GroupsApi,
} from "@/lib/groups/google"
import { isValidGroupId } from "@/lib/groups/scope"
import type {
  GroupMember,
  GroupsResult,
  ManagedGroup,
  MemberChangeResult,
} from "@/lib/groups/types"

export const MAX_BATCH = 200
// Small on purpose: Directory API quotas are per project.
const CONCURRENCY = 4

export const DENIED = "你不是這個群組的管理者"
export const NOT_MANAGED = "這個群組不存在，或不開放給 portal 管理"
export const INVALID_INPUT = "請求內容格式不正確"
const UNKNOWN_GROUP = "(unknown)"

export type GroupAccess = {
  userId: string
  api: GroupsApi
  /** is_group_manager() with the member's own client. Throws if the RPC fails. */
  isManager: (groupId: string) => Promise<boolean>
}

export type MembershipDeps = GroupAccess & {
  /** Gets each request's audit rows once. Must not throw. */
  audit: (rows: AuditInsert[]) => void
}

const notManaged = (): GroupsResult<never> => ({
  status: "forbidden",
  reason: "not_managed",
  detail: NOT_MANAGED,
})

export function parseGroupId(value: unknown): string | null {
  return typeof value === "string" && isValidGroupId(value) ? value : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUserId(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null
}

function parseAddress(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_EMAIL_LENGTH
    ? normalizeEmail(value)
    : null
}

// A malformed request is not audited (it could carry anything), but a forged
// one should still leave a trace: who, and which check it failed.
export function malformed<T>(userId: string, check: string, result: T): T {
  console.warn("[groups] malformed request", { userId, check })
  return result
}

/** Every one valid, at least one, duplicates dropped — or null. */
function parseAddresses(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const out: string[] = []
  for (const raw of value as unknown[]) {
    const email = parseAddress(raw)
    if (email === null) return null
    if (!out.includes(email)) out.push(email)
  }
  return out
}

type Verdict =
  | { ok: true; group: ManagedGroup }
  | {
      ok: false
      result: GroupsResult<never>
      groupEmail: string | null
      why: string
    }

async function authorize(
  access: GroupAccess,
  groupId: string
): Promise<Verdict> {
  const isManager = await access.isManager(groupId)
  // Only a manager makes the portal ask Google about the group.
  const group = isManager ? await getGroup(access.api, groupId) : null
  const verdict = authorizeGroup({
    isManager,
    group,
    domain: access.api.domain,
  })
  if (verdict.ok) return verdict
  const denied = verdict.reason === "denied"
  return {
    ok: false,
    result: {
      status: "forbidden",
      reason: verdict.reason,
      detail: denied ? DENIED : NOT_MANAGED,
    },
    groupEmail: group?.email ?? null,
    why: denied ? "not a manager" : "not manageable",
  }
}

/** One row for a whole request, however many addresses it carried. */
function requestRow(
  userId: string,
  group: { id: string; email: string | null },
  action: "add" | "remove",
  emails: string[],
  outcome: "denied" | "error",
  why: string
): AuditInsert {
  return buildAuditRow(
    userId,
    { id: group.id, email: group.email ?? UNKNOWN_GROUP },
    action,
    {
      email: emails[0] ?? "",
      outcome,
      detail:
        emails.length > 1
          ? `${why} (${emails.length} addresses in this request)`
          : why,
    }
  )
}

export async function readGroup(
  access: GroupAccess,
  groupIdInput: unknown
): Promise<GroupsResult<{ group: ManagedGroup; members: GroupMember[] }>> {
  const groupId = parseGroupId(groupIdInput)
  if (!groupId) return malformed(access.userId, "group id", notManaged())
  try {
    const auth = await authorize(access, groupId)
    if (!auth.ok) return auth.result
    const members = await listMembers(access.api, auth.group.id)
    return { status: "ok", data: { group: auth.group, members } }
  } catch (err) {
    console.error("[groups] read failed", err)
    return failure(err)
  }
}

export async function addToGroup(
  deps: MembershipDeps,
  groupIdInput: unknown,
  emailsInput: unknown
): Promise<GroupsResult<MemberChangeResult[]>> {
  const groupId = parseGroupId(groupIdInput)
  if (!groupId) return malformed(deps.userId, "group id", notManaged())
  if (Array.isArray(emailsInput) && emailsInput.length > MAX_BATCH)
    return malformed(deps.userId, "batch size", {
      status: "error",
      detail: `一次最多加入 ${MAX_BATCH} 個地址`,
    })
  const emails = parseAddresses(emailsInput)
  if (!emails)
    return malformed(deps.userId, "addresses", {
      status: "error",
      detail: INVALID_INPUT,
    })

  const rows: AuditInsert[] = []
  try {
    const auth = await authorize(deps, groupId)
    if (!auth.ok) {
      rows.push(
        requestRow(
          deps.userId,
          { id: groupId, email: auth.groupEmail },
          "add",
          emails,
          "denied",
          auth.why
        )
      )
      return auth.result
    }
    const group = auth.group
    // A credential or permission failure is the same for every address:
    // stop sending the rest and report it once.
    const abort: { cause: unknown } = { cause: null }
    const results = await mapLimited(
      emails,
      CONCURRENCY,
      async (email): Promise<MemberChangeResult> => {
        // All of it inside the try: mapLimited must never reject (batch.ts).
        try {
          const added = await addMember(deps.api, group.id, email)
          return added.email === email
            ? { email, outcome: added.outcome }
            : { email, outcome: added.outcome, listedAs: added.email }
        } catch (err) {
          if (isFatal(err) && abort.cause === null) abort.cause = err
          return { email, outcome: "error", detail: describeError(err) }
        }
      },
      () => abort.cause !== null
    )
    for (const r of results)
      rows.push(buildAuditRow(deps.userId, group, "add", r))
    if (abort.cause !== null) {
      console.error("[groups] add stopped", abort.cause)
      return failure(abort.cause)
    }
    return { status: "ok", data: results }
  } catch (err) {
    // Authorisation itself failed: the token, is_group_manager() or
    // getGroup. Unlike a malformed request this was a real attempt, so it
    // is recorded — once.
    console.error("[groups] add failed", err)
    rows.push(
      requestRow(
        deps.userId,
        { id: groupId, email: null },
        "add",
        emails,
        "error",
        describeError(err)
      )
    )
    return failure(err)
  } finally {
    if (rows.length > 0) deps.audit(rows)
  }
}

export async function removeFromGroup(
  deps: MembershipDeps,
  groupIdInput: unknown,
  emailInput: unknown
): Promise<GroupsResult<MemberChangeResult>> {
  const groupId = parseGroupId(groupIdInput)
  if (!groupId) return malformed(deps.userId, "group id", notManaged())
  const email = parseAddress(emailInput)
  if (!email)
    return malformed(deps.userId, "address", {
      status: "error",
      detail: INVALID_INPUT,
    })

  const rows: AuditInsert[] = []
  try {
    const auth = await authorize(deps, groupId)
    if (!auth.ok) {
      rows.push(
        requestRow(
          deps.userId,
          { id: groupId, email: auth.groupEmail },
          "remove",
          [email],
          "denied",
          auth.why
        )
      )
      return auth.result
    }
    let result: MemberChangeResult
    let fatal: unknown = null
    try {
      result = {
        email,
        outcome: await removeMember(deps.api, auth.group.id, email),
      }
    } catch (err) {
      if (isFatal(err)) fatal = err
      result = { email, outcome: "error", detail: describeError(err) }
    }
    rows.push(buildAuditRow(deps.userId, auth.group, "remove", result))
    if (fatal !== null) return failure(fatal)
    return { status: "ok", data: result }
  } catch (err) {
    console.error("[groups] remove failed", err)
    rows.push(
      requestRow(
        deps.userId,
        { id: groupId, email: null },
        "remove",
        [email],
        "error",
        describeError(err)
      )
    )
    return failure(err)
  } finally {
    if (rows.length > 0) deps.audit(rows)
  }
}
