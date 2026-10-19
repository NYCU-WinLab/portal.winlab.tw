"use client"

import { usePendingMembers } from "@/hooks/groups/use-pending-members"
import type { GroupMember } from "@/lib/groups/types"
import type { KeycloakGroupMember } from "@/lib/rooms/keycloak-groups"

import { AddMembersDialog } from "./add-members-dialog"
import { MemberList } from "./member-list"

type Person = {
  id: string
  name: string | null
  email: string
  labStatus: string | null
}
type Cohort = { name: string; members: KeycloakGroupMember[] }

export function GroupMembersPanel({
  groupId,
  domain,
  members,
  people,
  cohorts,
}: {
  groupId: string
  domain: string
  members: GroupMember[]
  people: Person[]
  cohorts: Cohort[] | null
}) {
  const { shown, markAdded, markRemoved, refreshSoon } =
    usePendingMembers(members)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm text-muted-foreground">
          成員（{shown.length}）
        </h2>
        <AddMembersDialog
          groupId={groupId}
          domain={domain}
          currentEmails={shown.flatMap((m) => (m.email ? [m.email] : []))}
          people={people}
          cohorts={cohorts}
          onAdded={markAdded}
          onFailed={refreshSoon}
        />
      </div>
      <MemberList
        groupId={groupId}
        members={shown}
        people={people}
        onRemoved={markRemoved}
      />
    </section>
  )
}
