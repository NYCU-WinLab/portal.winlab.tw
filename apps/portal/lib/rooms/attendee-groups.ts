// Pure logic mapping Keycloak groups onto portal users. Kept out of the
// Keycloak client so it can be unit tested without any admin credential.

import type { AttendeeGroup } from "./keycloak-groups"

export interface PortalAttendeeGroup {
  id: string
  name: string
  path: string
  /** portal user_profiles ids for members we could match. */
  userIds: string[]
  /**
   * Group members with no matching portal account. Surfaced rather than
   * silently dropped — "I picked the group but Alice didn't get the invite"
   * is exactly the kind of thing that should be visible up front.
   */
  unmatched: string[]
}

/**
 * Email is the join key: Keycloak is the IdP portal accounts are created
 * from, so a member's email is the same string on both sides. Compared
 * case-insensitively since neither system normalises it.
 */
export function mapGroupsToPortalUsers(
  groups: AttendeeGroup[],
  portalUsers: { id: string; email: string | null }[]
): PortalAttendeeGroup[] {
  const byEmail = new Map<string, string>()
  for (const user of portalUsers) {
    if (user.email) byEmail.set(user.email.toLowerCase(), user.id)
  }

  return groups.map((group) => {
    const userIds: string[] = []
    const unmatched: string[] = []

    for (const member of group.members) {
      const id = member.email
        ? byEmail.get(member.email.toLowerCase())
        : undefined
      if (id) {
        if (!userIds.includes(id)) userIds.push(id)
      } else {
        // Label which of the two failures this is. "Keycloak didn't give us
        // an email" and "the email doesn't match any Portal account" look
        // identical in a bare name list but need completely different fixes.
        const who = member.name ?? member.id
        unmatched.push(
          member.email ? `${who} <${member.email}>` : `${who}(無 email)`
        )
      }
    }

    return {
      id: group.id,
      name: group.name,
      path: group.path,
      userIds,
      unmatched,
    }
  })
}

/** Groups with at least one matched member, sorted by path for stable UI. */
export function usableGroups(
  groups: PortalAttendeeGroup[]
): PortalAttendeeGroup[] {
  return groups
    .filter((g) => g.userIds.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path))
}
