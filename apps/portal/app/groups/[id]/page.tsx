import { notFound } from "next/navigation"

import { fetchCohorts } from "@/lib/groups/cohorts"
import { isValidGroupId } from "@/lib/groups/scope"
import { createClient } from "@/lib/supabase/server"

import { getGroupMembers } from "../actions"
import { GroupMembersPanel } from "../_components/group-members-panel"
import { ManagerEditor } from "../_components/manager-editor"
import { RecentChanges } from "../_components/recent-changes"

export const dynamic = "force-dynamic"
// Vercel Fluid's default and the Hobby ceiling. An action's 60 s budget
// (BATCH_BUDGET_MS) plus one call's tail and the after() audit fit well in it.
export const maxDuration = 300

export default async function GroupPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!isValidGroupId(id)) notFound()

  // Authorisation first, on its own: anything else this page reads —
  // Keycloak above all — is read only for someone allowed to see the group.
  const membersResult = await getGroupMembers(id)

  // The portal's own refusals look like a missing page; Google refusing the
  // service account does not — an admin has to see that and fix it.
  if (
    membersResult.status === "forbidden" &&
    membersResult.reason !== "google_permission"
  )
    notFound()
  // A failed read still renders the panel: this page is also what the
  // scheduled router.refresh() re-reads land on, and the panel keeps the last
  // good list (and the open add dialog) through a failure. Nothing else is
  // read then — an error can come from before the authorisation check.
  if (membersResult.status !== "ok")
    return (
      <div className="flex flex-col gap-8">
        <GroupMembersPanel
          key="panel"
          groupId={id}
          data={null}
          error={
            membersResult.status === "unconfigured"
              ? "Google 群組整合尚未設定"
              : membersResult.detail
          }
        />
      </div>
    )

  const supabase = await createClient()
  const [profiles, cohorts, audit, refusals, adminCheck, managers] =
    await Promise.all([
      supabase.from("user_profiles").select("id, name, email, lab_status"),
      fetchCohorts(),
      supabase
        .from("group_membership_audit")
        .select("id, actor_id, member_email, action, outcome, created_at")
        .eq("group_id", id)
        .neq("outcome", "denied")
        .order("created_at", { ascending: false })
        .limit(20),
      // Refusals are collapsed in the list: any member can write them for
      // any group, so they must not push real changes out of the window.
      supabase
        .from("group_membership_audit")
        .select("id, actor_id, member_email, action, outcome, created_at", {
          count: "exact",
        })
        .eq("group_id", id)
        .eq("outcome", "denied")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.rpc("is_portal_admin"),
      supabase.from("group_managers").select("user_id").eq("group_id", id),
    ])

  // A failed profile read is not "nobody has a profile": without it the
  // picker could not tell alumni apart and every member would read as 外部.
  const profilesFailed = profiles.error !== null
  if (profilesFailed)
    console.error("[groups] profiles read failed", profiles.error)
  const isAdmin = adminCheck.data
  if (adminCheck.error)
    console.error("[groups] is_portal_admin failed", adminCheck.error)
  if (refusals.error)
    console.error("[groups] refusals read failed", refusals.error)
  if (audit.error) console.error("[groups] audit read failed", audit.error)
  if (managers.error)
    console.error("[groups] managers read failed", managers.error)

  const people = (profiles.data ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email!.toLowerCase(),
      labStatus: p.lab_status,
    }))
  const { group, members } = membersResult.data

  return (
    <div className="flex flex-col gap-8">
      {profilesFailed && (
        <p className="text-xs text-destructive">
          無法讀取成員姓名與在學狀態，名單只顯示 email，也暫時不能依屆別加入。
        </p>
      )}
      <GroupMembersPanel
        key="panel"
        groupId={group.id}
        error={null}
        data={{
          group,
          members,
          people,
          cohorts,
          profilesLoaded: !profilesFailed,
        }}
      />
      {adminCheck.error && (
        <p className="text-xs text-destructive">
          無法確認管理員身分，管理者編輯暫時不顯示，請稍後重新整理。
        </p>
      )}
      {isAdmin === true && managers.error && (
        <p className="text-xs text-destructive">
          無法讀取這個群組的管理者名單，請稍後重新整理。
        </p>
      )}
      {isAdmin === true && !managers.error && (
        <ManagerEditor
          groupId={group.id}
          managerIds={(managers.data ?? []).map((m) => m.user_id)}
          people={people}
        />
      )}
      <RecentChanges
        rows={audit.data ?? []}
        people={people}
        denied={refusals.data ?? []}
        deniedCount={refusals.count ?? 0}
        deniedFailed={refusals.error !== null}
        failed={audit.error !== null}
      />
    </div>
  )
}
