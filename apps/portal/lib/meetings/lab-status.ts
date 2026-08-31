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
 * Parse a raw, unvalidated `lab_status` DB value (or a Keycloak leaf) into a
 * known status. The boundary every caller that hands a string into
 * `isSelectableMember` must pass through first, rather than trusting the
 * column's text.
 */
export function parseLabStatus(v: string | null): LabStatus | null {
  return v !== null && (LAB_STATUSES as readonly string[]).includes(v)
    ? (v as LabStatus)
    : null
}

/**
 * Which children of `/lab-member` this code does not know how to file under a
 * `LabStatus`. Never skip one silently: the realm has already been
 * restructured once (a subgroup rename), and a renamed or newly added group
 * mapping to null would quietly drop everyone in it from the sync — which
 * looks, downstream, exactly like those people leaving. That is a decision
 * for a human, not something to `continue` past.
 */
export function findUnrecognisedGroupPaths(childPaths: string[]): string[] {
  return childPaths.filter((path) => labStatusFromGroupPath(path) === null)
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
 * of the pre-Keycloak shell accounts that were cluttering the picker.
 */
export function isSelectableMember(u: {
  username: string | null
  labStatus: LabStatus | null
}): boolean {
  if (!u.username || EXCLUDED_USERNAMES.has(u.username)) return false
  return isRotationMember(u.labStatus)
}

/**
 * Whether someone is in the weekly meeting rotation.
 *
 * The lab's rule, stated 2026-08-31: **只保留 master 跟 ph.d**. 老師, 助理,
 * 大學部 and 校友 attend meetings but are not scheduled to present and are not
 * drawn for the questioning group.
 *
 * The TypeScript mirror of `public.meetings_is_rotation_member` (migration
 * 20260831140000) — same rule, and the two must not drift, because SQL decides
 * who gets scheduled while this decides what the panel says about it. A member
 * the database has quietly dropped from every roster while the UI shows them as
 * normal is the exact failure this pair exists to prevent.
 *
 * Takes raw text rather than a parsed {@link LabStatus} so the two really do
 * agree: SQL tests the column, and `parseLabStatus` maps anything outside
 * LAB_STATUSES to null. `user_profiles_lab_status_check` makes a value outside
 * that set unreachable today — this signature keeps it unreachable if the
 * constraint is ever widened.
 *
 * Note what this does NOT check, unlike {@link isSelectableMember}: username.
 * That one is choosing who may be ADDED to a pool and fails closed on shell
 * accounts; this one describes someone already in one, where pool membership is
 * itself the human judgement. See the migration header — they are deliberately
 * different and should not be merged.
 */
export function isRotationMember(labStatus: string | null): boolean {
  return labStatus === "doctoral" || labStatus === "master"
}

/**
 * Why someone in a pool is not being scheduled, or null when they are.
 *
 * Three states, not two, and the difference is what the automation does about
 * them (see 20260831140200's header):
 *
 * - `"unsynced"` — Keycloak had nothing to say. Also what a member gets the
 *   morning after renaming themselves in Keycloak. Not given new slots, but
 *   keeps the ones they hold, and an admin may still assign them by hand.
 * - `"alumni"` / `"not-graduate"` — Keycloak has positively placed them outside
 *   the rotation. Not given new slots, evicted from future weeks on the next
 *   resync, and rejected for manual assignment.
 */
export function rotationExclusionReason(
  labStatus: string | null
): "unsynced" | "alumni" | "not-graduate" | null {
  if (isRotationMember(labStatus)) return null
  if (labStatus === null) return "unsynced"
  if (labStatus === "alumni") return "alumni"
  return "not-graduate"
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

/** Both floors in {@link checkLabStatusUpdatePlan} must trip before refusing. */
const MASS_NULL_ROW_FLOOR = 3
const MASS_NULL_RATIO_FLOOR = 0.2

/**
 * Refuses a sweep that would clear `lab_status` for an implausible number of
 * profiles in one pass.
 *
 * Graduating moves someone to `"alumni"` — it never nulls them. A profile
 * going from some status to null means Keycloak has nothing to say about that
 * username any more, which is legitimate one or two people at a time (deleted
 * from the realm) but is exactly the symptom of a broken read otherwise: a
 * `/lab-member` child group renamed, a page that came back transiently empty,
 * a credential that lost a scope. None of those are distinguishable from each
 * other here, so the guard doesn't try — it only asks "how many people is
 * this sweep about to erase", and refuses to write anything when the answer
 * is large relative to how many currently have a status at all.
 *
 * Both floors must trip, so a small lab or a handful of genuine departures is
 * never blocked: more than {@link MASS_NULL_ROW_FLOOR} rows, AND more than
 * {@link MASS_NULL_RATIO_FLOOR} of the rows that currently carry a status.
 */
export function checkLabStatusUpdatePlan(
  profiles: LabStatusRow[],
  updates: LabStatusUpdate[]
): { ok: true } | { ok: false; detail: string } {
  const currentNonNull = profiles.filter((p) => p.labStatus !== null).length
  // planLabStatusUpdates only emits a row when the value actually changed, so
  // every update landing on null here previously held a real status.
  const clearedCount = updates.filter((u) => u.labStatus === null).length

  const ratio = currentNonNull === 0 ? 0 : clearedCount / currentNonNull
  if (clearedCount > MASS_NULL_ROW_FLOOR && ratio > MASS_NULL_RATIO_FLOOR) {
    const pct = Math.round(ratio * 100)
    return {
      ok: false,
      detail:
        `refusing to clear lab_status for ${clearedCount} of ` +
        `${currentNonNull} profiles that currently carry one (${pct}%) in ` +
        "one sweep — check whether a /lab-member child group was renamed " +
        "or came back empty before applying this by hand",
    }
  }

  return { ok: true }
}
