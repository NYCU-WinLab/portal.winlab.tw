// A Keycloak subgroup, ready to drop into the attendee list.
//
// There is deliberately no mapping step here any more. This used to resolve
// each Keycloak member to a Portal account by email so the booking could
// store user_profiles ids — which meant anyone who had never signed into
// Portal was silently dropped from their own project group, and every
// mismatch surfaced as "this member has no Portal account" rather than as
// what it was. An invite only needs a name and an address, and Keycloak
// supplies both, so the group's members are the attendees.

import type { AttendeeGroup } from "./keycloak-groups"

/** Who an invite goes to. No Portal account required. */
export interface AttendeeContact {
  name: string
  email: string
  /**
   * Keycloak username, when known. Only used to build the Teams topic
   * prefix for a meeting booked without picking a group — `name` is Chinese
   * and would make a poor recording filename.
   */
  username?: string
}

export interface PickableGroup {
  id: string
  name: string
  description: string | null
  path: string
  /**
   * Whether this group is linked to a GitLab group at all. The path itself
   * stays server-side: the browser only needs to know whether to offer an
   * epic picker, and the action resolves the path again from Keycloak so a
   * caller can't point it at some other group.
   */
  gitlabLinked: boolean
  members: AttendeeContact[]
  /**
   * Group members Keycloak gave us with no email address — they can't be
   * invited, and saying so beats quietly shrinking the group.
   */
  unmailable: string[]
}

export function toPickableGroups(groups: AttendeeGroup[]): PickableGroup[] {
  return groups
    .map((group) => {
      const members: AttendeeContact[] = []
      const unmailable: string[] = []
      const seen = new Set<string>()

      for (const member of group.members) {
        if (!member.email) {
          unmailable.push(member.name ?? member.id)
          continue
        }
        const key = member.email.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        members.push({
          name: member.name ?? member.email,
          email: member.email,
          ...(member.username ? { username: member.username } : {}),
        })
      }

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        path: group.path,
        gitlabLinked: !!group.gitlabPath,
        members,
        unmailable,
      }
    })
    .filter((g) => g.members.length > 0)
    .sort((a, b) => a.path.localeCompare(b.path))
}

/**
 * What to call a group in the UI. Keycloak group names are slugs meant for
 * paths, so the description is the one written for people to read; fall
 * back to the name when a group has no description rather than showing
 * nothing.
 */
export function groupLabel(
  group: Pick<PickableGroup, "name" | "description">
): string {
  return group.description ?? group.name
}

/** The title to pre-fill when a whole group is invited. */
export function groupMeetingTitle(
  group: Pick<PickableGroup, "name" | "description">
): string {
  return `${groupLabel(group)} 會議`
}

/**
 * The lab's advisor. Keycloak's project subgroups list students only, so
 * inviting him is a per-meeting decision rather than something the group
 * membership can answer — hence the explicit toggle in the picker.
 */
export const ADVISOR_USERNAME = "cctseng"

/** Merge picks into an existing list, de-duplicating on email. */
export function mergeAttendees(
  current: AttendeeContact[],
  incoming: AttendeeContact[]
): AttendeeContact[] {
  const seen = new Set(current.map((a) => a.email.toLowerCase()))
  const next = [...current]
  for (const contact of incoming) {
    const key = contact.email.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(contact)
  }
  return next
}
