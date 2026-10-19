import { notFound } from "next/navigation"

import { fetchCohorts } from "@/lib/groups/cohorts"
import { isValidGroupId } from "@/lib/groups/scope"
import { createClient } from "@/lib/supabase/server"

import { getGroupMembers } from "../actions"
import { GroupMembersPanel } from "../_components/group-members-panel"
import { RecentChanges } from "../_components/recent-changes"

export const dynamic = "force-dynamic"

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
  if (membersResult.status !== "ok")
    return (
      <p className="text-destructive">
        讀取成員失敗：
        {membersResult.status === "unconfigured"
          ? "Google 群組整合尚未設定"
          : membersResult.detail}
      </p>
    )

  const supabase = await createClient()
  const [profiles, cohorts, audit] = await Promise.all([
    supabase.from("user_profiles").select("id, name, email, lab_status"),
    fetchCohorts(),
    supabase
      .from("group_membership_audit")
      .select("id, actor_id, member_email, action, outcome, created_at")
      .eq("group_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const people = (profiles.data ?? [])
    .filter((p) => p.email)
    .map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email!.toLowerCase(),
      labStatus: p.lab_status,
    }))
  const { group, members } = membersResult.data
  const domain = group.email.slice(group.email.lastIndexOf("@") + 1)

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-lg">{group.name}</h1>
        <p className="text-xs text-muted-foreground">{group.email}</p>
      </header>
      <GroupMembersPanel
        groupId={group.id}
        domain={domain}
        members={members}
        people={people}
        cohorts={cohorts}
      />
      <RecentChanges rows={audit.data ?? []} people={people} />
    </div>
  )
}
