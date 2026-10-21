"use client"

import { useState } from "react"

import { usePendingMembers } from "@/hooks/groups/use-pending-members"
import type { GroupMember, ManagedGroup } from "@/lib/groups/types"
import { readFailureNotice, retainLastGood } from "@/lib/groups/view"
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

export type PanelData = {
  group: ManagedGroup
  members: GroupMember[]
  people: Person[]
  cohorts: Cohort[] | null
  /** false when user_profiles could not be read: statuses and names are unknown. */
  profilesLoaded: boolean
}

export function GroupMembersPanel({
  groupId,
  data,
  error,
}: {
  groupId: string
  /** null when this render's read of Google failed. */
  data: PanelData | null
  error: string | null
}) {
  // A failed re-read must not take the panel (and the add dialog's kept
  // addresses, the 同步中 overlay) away: keep showing the last good read.
  // Adjusting state while rendering, React's pattern for derived state.
  const [kept, setKept] = useState<PanelData | null>(data)
  const shownData = retainLastGood(kept, data)
  if (data && data !== kept) setKept(data)

  const notice = readFailureNotice(error, shownData !== null)
  if (!shownData)
    return (
      <p className="text-destructive">
        {notice.kind === "empty" ? notice.text : "讀取成員失敗"}
      </p>
    )
  return (
    <Loaded
      groupId={groupId}
      data={shownData}
      note={notice.kind === "stale" ? notice.text : null}
    />
  )
}

function Loaded({
  groupId,
  data,
  note,
}: {
  groupId: string
  data: PanelData
  note: string | null
}) {
  const { group, members, people, cohorts, profilesLoaded } = data
  const domain = group.email.slice(group.email.lastIndexOf("@") + 1)
  const { shown, markAdded, markRemoved, refreshSoon } =
    usePendingMembers(members)

  return (
    <section className="flex flex-col gap-2">
      <header className="mb-6">
        <h1 className="text-lg">{group.name}</h1>
        <p className="text-xs text-muted-foreground">{group.email}</p>
      </header>
      {note && <p className="text-xs text-destructive">{note}</p>}
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
          profilesLoaded={profilesLoaded}
          onAdded={markAdded}
          onFailed={refreshSoon}
        />
      </div>
      <MemberList
        groupId={groupId}
        members={shown}
        people={people}
        profilesLoaded={profilesLoaded}
        onRemoved={markRemoved}
        onFailed={refreshSoon}
      />
    </section>
  )
}
