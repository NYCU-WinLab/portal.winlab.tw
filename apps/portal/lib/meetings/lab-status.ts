// Lab membership status, as mirrored from Keycloak's /lab-member/* subgroups.
//
// Pure logic only — no fetch, no Supabase, no React. The Keycloak round trip
// lives in lib/keycloak/lab-status.ts and the write in the cron route; keeping
// the rules here is what makes them testable with `bun test`.

export const LAB_STATUSES = [
  "teacher",
  "assistant",
  "doctoral",
  "master",
  "undergrad",
  "alumni",
] as const

export type LabStatus = (typeof LAB_STATUSES)[number]

const LAB_MEMBER_PREFIX = "/lab-member/"

/**
 * The realm carries two kinds of group: identity (`/lab-member/*`) and project
 * (`/winlab-projects/*`), plus a few access groups. Only the first answers
 * "who is this person", so everything else maps to null rather than to a
 * guessed status.
 */
export function labStatusFromGroupPath(path: string): LabStatus | null {
  if (!path.startsWith(LAB_MEMBER_PREFIX)) return null
  const leaf = path.slice(LAB_MEMBER_PREFIX.length)
  return (LAB_STATUSES as readonly string[]).includes(leaf)
    ? (leaf as LabStatus)
    : null
}

/**
 * Accounts that hold a real lab-member group but are not people. They sit
 * inside /lab-member/master, so the group rule alone cannot exclude them.
 */
export const EXCLUDED_USERNAMES: ReadonlySet<string> = new Set([
  "test-master",
  "winlab-test-master",
])

/**
 * Whether someone may be offered as a presenter-roster or question-pool
 * candidate. A whitelist, and it fails closed: an account Keycloak has nothing
 * to say about is not selectable, because "unclassified" is exactly the shape
 * of the eight pre-Keycloak shell accounts that were cluttering the picker.
 */
export function isSelectableMember(u: {
  username: string | null
  labStatus: string | null
}): boolean {
  if (!u.username || EXCLUDED_USERNAMES.has(u.username)) return false
  return u.labStatus !== null && u.labStatus !== "alumni"
}

export type LabStatusRow = {
  id: string
  username: string | null
  labStatus: string | null
}

export type LabStatusUpdate = {
  id: string
  labStatus: LabStatus | null
}

/**
 * Diff the portal's copy against Keycloak's, returning only what changed.
 *
 * Writing every row every night would churn the table and make the cron's own
 * log useless for spotting a real membership change, so the caller only writes
 * this list. A profile Keycloak no longer knows about is cleared to null
 * rather than left stale — someone deleted from the realm, or a shell account
 * that never existed there.
 */
export function planLabStatusUpdates(
  profiles: LabStatusRow[],
  fromKeycloak: Map<string, LabStatus>
): LabStatusUpdate[] {
  const updates: LabStatusUpdate[] = []
  for (const profile of profiles) {
    const next = profile.username
      ? (fromKeycloak.get(profile.username) ?? null)
      : null
    if (next !== profile.labStatus)
      updates.push({ id: profile.id, labStatus: next })
  }
  return updates
}
