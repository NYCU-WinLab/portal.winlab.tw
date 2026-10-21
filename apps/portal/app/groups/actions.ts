"use server"

// /groups reads and writes. The browser never sees the Google credential:
// these run on the server. The order of checks — input, is_group_manager()
// before any Google call, then Google's own address for the group against
// the gcp-* and domain fence, then the group's ancestors — lives in
// lib/groups/membership.ts, where it is tested with fakes. This file only
// wires in the real dependencies: the member's own Supabase client, the
// Directory API from env, and after() so the audit is written once the
// response is out.
//
// Only async functions may be exported from a "use server" file.

import { after } from "next/server"

import { recordMembershipChanges } from "@/lib/groups/audit"
import { visibleGroups } from "@/lib/groups/authorize"
import { failure, UNEXPECTED_MESSAGE } from "@/lib/groups/failure"
import { getGroup, listDomainGroups } from "@/lib/groups/google"
import { groupsApiFromEnv } from "@/lib/groups/google-auth"
import { UNAUTHORIZED } from "@/lib/groups/messages"
import {
  addToGroup,
  INVALID_INPUT,
  malformed,
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
    return {
      ok: false,
      result: { status: "error", detail: UNAUTHORIZED, sent: false },
    }
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
    if (!user) return { status: "error", detail: UNAUTHORIZED, sent: false }
    const api = groupsApiFromEnv()
    if (!api) return { status: "unconfigured" }
    const supabase = await createClient()
    const [{ data: isAdmin, error: adminError }, { data: rows, error }] =
      await Promise.all([
        supabase.rpc("is_portal_admin"),
        supabase
          .from("group_managers")
          .select("group_id")
          .eq("user_id", user.id),
      ])
    // An admin must not be told they manage nothing because a check failed.
    if (adminError)
      return { status: "error", detail: "無法確認管理員身分，請稍後再試" }
    if (error) {
      console.error("[groups] group_managers read failed", error)
      return { status: "error", detail: "無法讀取群組管理者，請稍後再試" }
    }
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
    return failure(err, false)
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
    return failure(err, false)
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

// The manager actions validate before any login check, so a forged call has
// no user yet; the log line still says who, when it can.
async function currentUserId(): Promise<string> {
  return (await getCurrentUser())?.id ?? "anonymous"
}

// The RPCs refuse anyone but a portal admin. Assigning also checks with
// Google that the group is one the portal may manage, so a gcp-* group never
// gets a manager row, even though every write re-checks anyway.
export async function assignGroupManager(
  groupId: string,
  userId: string
): Promise<ManagerResult> {
  const id = parseGroupId(groupId)
  if (!id)
    return malformed(await currentUserId(), "group id", {
      ok: false,
      error: NOT_MANAGED,
    })
  const member = parseUserId(userId)
  if (!member)
    return malformed(await currentUserId(), "user id", {
      ok: false,
      error: INVALID_INPUT,
    })
  try {
    const api = groupsApiFromEnv()
    if (!api) return { ok: false, error: "Google 群組整合尚未設定" }
    const supabase = await createClient()
    const { data: isAdmin, error: adminError } =
      await supabase.rpc("is_portal_admin")
    if (adminError) {
      console.error("[groups] is_portal_admin failed", adminError)
      return { ok: false, error: "無法確認管理員身分，請稍後再試" }
    }
    if (isAdmin !== true)
      return { ok: false, error: "只有 portal 管理員可以指派" }
    const group = await getGroup(api, id)
    if (!group || !isManageableGroup(group.email, api.domain))
      return { ok: false, error: NOT_MANAGED }
    const { error } = await supabase.rpc("groups_assign_manager", {
      p_group_id: group.id,
      p_user_id: member,
    })
    if (!error) return { ok: true }
    // 42501 is the RPC's own "not a portal admin"; anything else is a real
    // failure, logged in full and reported without PostgREST's wording.
    if (error.code !== "42501")
      console.error("[groups] groups_assign_manager failed", error)
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "只有 portal 管理員可以指派"
          : "指派失敗，請稍後再試",
    }
  } catch (err) {
    console.error("[groups] assignGroupManager failed", err)
    const res = failure(err)
    return {
      ok: false,
      error: "detail" in res ? res.detail : UNEXPECTED_MESSAGE,
    }
  }
}

// Unassigning needs no Google call: taking access away is always allowed,
// including for a group that has since disappeared from Google.
export async function unassignGroupManager(
  groupId: string,
  userId: string
): Promise<ManagerResult> {
  const id = parseGroupId(groupId)
  if (!id)
    return malformed(await currentUserId(), "group id", {
      ok: false,
      error: INVALID_INPUT,
    })
  const member = parseUserId(userId)
  if (!member)
    return malformed(await currentUserId(), "user id", {
      ok: false,
      error: INVALID_INPUT,
    })
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc("groups_unassign_manager", {
      p_group_id: id,
      p_user_id: member,
    })
    if (error) {
      console.error("[groups] groups_unassign_manager failed", error)
      return { ok: false, error: "移除失敗，請稍後再試" }
    }
    return { ok: true }
  } catch (err) {
    console.error("[groups] unassignGroupManager failed", err)
    return { ok: false, error: UNEXPECTED_MESSAGE }
  }
}
