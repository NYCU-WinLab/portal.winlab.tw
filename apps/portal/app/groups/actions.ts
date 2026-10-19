"use server"

// /groups reads and writes. The browser never sees the Google credential:
// these run on the server. The order of checks — input, is_group_manager()
// before any Google call, then Google's own address for the group against
// the gcp-* and domain fence — lives in lib/groups/membership.ts, where it
// is tested with fakes. This file only wires in the real dependencies: the
// member's own Supabase client, the Directory API from env, and after() so
// the audit is written once the response is out.
//
// Only async functions may be exported from a "use server" file.

import { after } from "next/server"

import { recordMembershipChanges } from "@/lib/groups/audit"
import { visibleGroups } from "@/lib/groups/authorize"
import { failure } from "@/lib/groups/failure"
import { getGroup, listDomainGroups } from "@/lib/groups/google"
import { groupsApiFromEnv } from "@/lib/groups/google-auth"
import {
  addToGroup,
  INVALID_INPUT,
  NOT_MANAGED,
  parseGroupId,
  parseUserId,
  readGroup,
  removeFromGroup,
  type MembershipDeps,
} from "@/lib/groups/membership"
import { isManageableGroup } from "@/lib/groups/scope"
import type {
  GroupMember,
  GroupsResult,
  ManagedGroup,
  MemberChangeResult,
} from "@/lib/groups/types"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/user"

type Context =
  | { ok: true; deps: MembershipDeps }
  | { ok: false; result: GroupsResult<never> }

async function requestContext(): Promise<Context> {
  const user = await getCurrentUser()
  if (!user)
    return { ok: false, result: { status: "error", detail: "Unauthorized" } }
  const api = groupsApiFromEnv()
  if (!api) return { ok: false, result: { status: "unconfigured" } }
  const supabase = await createClient()
  return {
    ok: true,
    deps: {
      userId: user.id,
      api,
      async isManager(groupId) {
        const { data, error } = await supabase.rpc("is_group_manager", {
          p_group_id: groupId,
        })
        if (error) throw new Error(`is_group_manager failed: ${error.message}`)
        return data === true
      },
      audit(rows) {
        after(() => recordMembershipChanges(rows))
      },
    },
  }
}

export async function listMyGroups(): Promise<GroupsResult<ManagedGroup[]>> {
  try {
    const user = await getCurrentUser()
    if (!user) return { status: "error", detail: "Unauthorized" }
    const api = groupsApiFromEnv()
    if (!api) return { status: "unconfigured" }
    const supabase = await createClient()
    const [{ data: isAdmin }, { data: rows, error }] = await Promise.all([
      supabase.rpc("is_portal_admin"),
      supabase.from("group_managers").select("group_id").eq("user_id", user.id),
    ])
    if (error) return { status: "error", detail: error.message }
    const managed = new Set((rows ?? []).map((r) => r.group_id))
    // Someone who manages nothing never causes a Google call.
    if (isAdmin !== true && managed.size === 0)
      return { status: "ok", data: [] }
    const all = await listDomainGroups(api)
    const data = visibleGroups(all, {
      isAdmin: isAdmin === true,
      managed,
      domain: api.domain,
    }).sort((a, b) => a.email.localeCompare(b.email))
    return { status: "ok", data }
  } catch (err) {
    console.error("[groups] listMyGroups failed", err)
    return failure(err)
  }
}

export async function getGroupMembers(
  groupId: string
): Promise<GroupsResult<{ group: ManagedGroup; members: GroupMember[] }>> {
  try {
    const ctx = await requestContext()
    if (!ctx.ok) return ctx.result
    return await readGroup(ctx.deps, groupId)
  } catch (err) {
    console.error("[groups] getGroupMembers failed", err)
    return failure(err)
  }
}

export async function addGroupMembers(
  groupId: string,
  emails: string[]
): Promise<GroupsResult<MemberChangeResult[]>> {
  try {
    const ctx = await requestContext()
    if (!ctx.ok) return ctx.result
    return await addToGroup(ctx.deps, groupId, emails)
  } catch (err) {
    console.error("[groups] addGroupMembers failed", err)
    return failure(err)
  }
}

export async function removeGroupMember(
  groupId: string,
  email: string
): Promise<GroupsResult<MemberChangeResult>> {
  try {
    const ctx = await requestContext()
    if (!ctx.ok) return ctx.result
    return await removeFromGroup(ctx.deps, groupId, email)
  } catch (err) {
    console.error("[groups] removeGroupMember failed", err)
    return failure(err)
  }
}

type ManagerResult = { ok: true } | { ok: false; error: string }

// The RPCs refuse anyone but a portal admin. Assigning also checks with
// Google that the group is one the portal may manage, so a gcp-* group never
// gets a manager row, even though every write re-checks anyway.
export async function assignGroupManager(
  groupId: string,
  userId: string
): Promise<ManagerResult> {
  const id = parseGroupId(groupId)
  if (!id) return { ok: false, error: NOT_MANAGED }
  const member = parseUserId(userId)
  if (!member) return { ok: false, error: INVALID_INPUT }
  try {
    const api = groupsApiFromEnv()
    if (!api) return { ok: false, error: "Google 群組整合尚未設定" }
    const supabase = await createClient()
    const { data: isAdmin } = await supabase.rpc("is_portal_admin")
    if (isAdmin !== true)
      return { ok: false, error: "只有 portal 管理員可以指派" }
    const group = await getGroup(api, id)
    if (!group || !isManageableGroup(group.email, api.domain))
      return { ok: false, error: NOT_MANAGED }
    const { error } = await supabase.rpc("groups_assign_manager", {
      p_group_id: group.id,
      p_user_id: member,
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (err) {
    console.error("[groups] assignGroupManager failed", err)
    const res = failure(err)
    return { ok: false, error: "detail" in res ? res.detail : "unknown" }
  }
}

// Unassigning needs no Google call: taking access away is always allowed,
// including for a group that has since disappeared from Google.
export async function unassignGroupManager(
  groupId: string,
  userId: string
): Promise<ManagerResult> {
  const id = parseGroupId(groupId)
  const member = parseUserId(userId)
  if (!id || !member) return { ok: false, error: INVALID_INPUT }
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc("groups_unassign_manager", {
      p_group_id: id,
      p_user_id: member,
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  } catch (err) {
    console.error("[groups] unassignGroupManager failed", err)
    return { ok: false, error: err instanceof Error ? err.message : "unknown" }
  }
}
