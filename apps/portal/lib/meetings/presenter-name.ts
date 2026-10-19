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
