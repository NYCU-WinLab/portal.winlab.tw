// Who presents is `presenter_user_id`; `meetings.presenter` is a copy of
// their name taken when the week was assigned. That copy went stale for every
// week scheduled before user_profiles.name switched to chinese_name (#1242),
// and would again on any rename, so readers ask the profile and only fall
// back to the copy when there is no profile to ask: an outside speaker (a
// speaker week's presenter_user_id is null by CHECK) or a member whose
// profile was deleted under ON DELETE SET NULL.

/**
 * PostgREST embed for the presenter's profile name, to add to a `meetings`
 * select. The foreign key is named so the embed can never resolve through
 * another relation between the two tables.
 */
export const PRESENTER_PROFILE =
  "presenter_profile:user_profiles!meetings_presenter_user_id_fkey(name)"

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
 * by name only, and a name already listed (or listed later by a member) is
 * the same person.
 */
export function presenterOrder(rows: PresenterRow[]): string[] {
  const seenIds = new Set<string>()
  const idlessNames = new Set<string>()
  const listed = new Set<string>()
  const order: string[] = []
  for (const row of rows) {
    const name = presenterName(row.presenter, row.presenter_profile)
    if (!name) continue
    if (row.presenter_user_id) {
      if (seenIds.has(row.presenter_user_id) || idlessNames.has(name)) continue
      seenIds.add(row.presenter_user_id)
    } else {
      if (listed.has(name)) continue
      idlessNames.add(name)
    }
    listed.add(name)
    order.push(name)
  }
  return order
}
