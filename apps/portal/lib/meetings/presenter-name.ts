// Who presents is `presenter_user_id`; `meetings.presenter` is a copy of
// their name taken when the week was assigned. That copy went stale for every
// week scheduled before user_profiles.name switched to chinese_name (#1242),
// and would again on any rename, so readers ask the profile and only fall
// back to the copy when there is no profile to ask: an outside speaker (a
// speaker week's presenter_user_id is null by CHECK) or a member whose
// profile was deleted under ON DELETE SET NULL.

import type { Database } from "@/lib/supabase/database.types"

type MeetingRelation =
  Database["public"]["Tables"]["meetings"]["Relationships"][number]

// Checked against the generated schema: once database.types.ts is
// regenerated after a migration that renames or drops this constraint, it is
// a typecheck failure here rather than a PostgREST error on every schedule
// read. Nothing regenerates the types automatically.
const PRESENTER_FK = "meetings_presenter_user_id_fkey" satisfies Extract<
  MeetingRelation,
  { columns: ["presenter_user_id"]; referencedRelation: "user_profiles" }
>["foreignKeyName"]

/**
 * PostgREST embed for the presenter's profile name, to add to a `meetings`
 * select. The foreign key is named so the embed can never resolve through
 * another relation between the two tables.
 */
export const PRESENTER_PROFILE =
  `presenter_profile:user_profiles!${PRESENTER_FK}(name)` as const

export interface PresenterProfile {
  name: string | null
}

export function presenterName(
  snapshot: string | null,
  profile: PresenterProfile | null | undefined
): string | null {
  return profile?.name?.trim() ? profile.name : snapshot
}

export interface PresenterRow {
  presenter: string | null
  presenter_user_id: string | null
  presenter_profile: PresenterProfile | null
}

/**
 * Upcoming weeks' presenters, first appearance only, for
 * `/api/meetings/schedule`'s `presenter_order`. A member is one entry however
 * many weeks they hold, so identity is the user id: two members who share a
 * name stay two entries. A speaker week carries no id (CHECK), so it is known
 * by name only, and never merged with a member: its name is free text, and a
 * match proves nothing about who it is.
 */
export function presenterOrder(rows: PresenterRow[]): string[] {
  const seen = new Set<string>()
  const order: string[] = []
  for (const row of rows) {
    const name = presenterName(row.presenter, row.presenter_profile)
    if (!name) continue
    const key = row.presenter_user_id
      ? `member:${row.presenter_user_id}`
      : `speaker:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    order.push(name)
  }
  return order
}
