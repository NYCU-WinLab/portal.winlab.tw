// Pure rules behind the /groups add preview and member list. No fetch, no
// Supabase.

import { normalizeEmail } from "@/lib/groups/email"
import type { GroupMember } from "@/lib/groups/types"
import type { KeycloakGroupMember } from "@/lib/rooms/keycloak-groups"

export function planAdditions(
  candidates: string[],
  currentMembers: string[]
): { toAdd: string[]; already: string[] } {
  const present = new Set(currentMembers.map((e) => e.trim().toLowerCase()))
  const toAdd: string[] = []
  const already: string[] = []
  for (const raw of candidates) {
    const email = raw.trim().toLowerCase()
    if (toAdd.includes(email) || already.includes(email)) continue
    if (present.has(email)) already.push(email)
    else toAdd.push(email)
  }
  return { toAdd, already }
}

/**
 * Addresses outside the domain. The first one added to a group makes Google
 * switch the group to "allow external members (admins only)", and removing
 * the member later does not switch it back — the preview says so.
 */
export function externalAddresses(emails: string[], domain: string): string[] {
  const suffix = `@${domain.trim().toLowerCase()}`
  return emails.filter((e) => !e.trim().toLowerCase().endsWith(suffix))
}

export type CohortCandidates = {
  emails: string[]
  skippedNoEmail: number
  skippedAlumni: number
  /** Kept, but with no portal profile (or no status): "exclude alumni" could not judge them. */
  unknownStatus: number
}

/**
 * Addresses to offer from a /lab-member/<year> cohort. Lab status comes from
 * user_profiles (mirrored from Keycloak by the kc-lab-status cron); someone
 * with no portal account has no status and is kept — only a positive
 * "alumni" excludes.
 */
export function cohortCandidates(
  members: KeycloakGroupMember[],
  statusByEmail: ReadonlyMap<string, string | null>,
  opts: { excludeAlumni: boolean }
): CohortCandidates {
  const emails: string[] = []
  let skippedNoEmail = 0
  let skippedAlumni = 0
  let unknownStatus = 0
  for (const m of members) {
    const email = m.email ? normalizeEmail(m.email) : null
    if (!email) {
      skippedNoEmail++
      continue
    }
    const status = statusByEmail.get(email)
    if (opts.excludeAlumni && status === "alumni") {
      skippedAlumni++
      continue
    }
    if (!emails.includes(email)) {
      emails.push(email)
      if (!status) unknownStatus++ // no profile, or a null lab_status
    }
  }
  return { emails, skippedNoEmail, skippedAlumni, unknownStatus }
}

const NO_COHORT: CohortCandidates = {
  emails: [],
  skippedNoEmail: 0,
  skippedAlumni: 0,
  unknownStatus: 0,
}

/**
 * What the cohort picker contributes to a batch. Without lab statuses
 * (`profilesLoaded` false) "exclude alumni" would exclude no one, so the
 * cohort contributes nothing, whatever was selected before the read failed.
 */
export function cohortContribution(
  members: KeycloakGroupMember[] | undefined,
  statusByEmail: ReadonlyMap<string, string | null>,
  opts: { excludeAlumni: boolean; profilesLoaded: boolean }
): CohortCandidates {
  if (!opts.profilesLoaded || !members) return NO_COHORT
  return cohortCandidates(members, statusByEmail, opts)
}

/**
 * The only memberships /groups may create or delete. OWNER and MANAGER are
 * out of reach, so the portal can neither strip a group of its owners nor
 * promote anyone.
 */
export function isPlainMember(role: string | null | undefined): boolean {
  return role === "MEMBER"
}

// ── Eventual consistency ────────────────────────────────────────────────────
// A member Google just accepted can be missing from the next list call for
// several seconds, and one just deleted can linger. The page trusts what the
// action reported and overlays it on Google's list until the list agrees.

export type PendingChanges = { added: string[]; removed: string[] }

export const NO_PENDING: PendingChanges = { added: [], removed: [] }

export type ShownMember = GroupMember & { pending: boolean }

export function withAdded(p: PendingChanges, emails: string[]): PendingChanges {
  const add = emails.map((e) => e.trim().toLowerCase())
  return {
    added: [...p.added, ...add.filter((e) => !p.added.includes(e))],
    removed: p.removed.filter((e) => !add.includes(e)),
  }
}

export function withRemoved(p: PendingChanges, email: string): PendingChanges {
  const e = email.trim().toLowerCase()
  return {
    added: p.added.filter((x) => x !== e),
    removed: p.removed.includes(e) ? p.removed : [...p.removed, e],
  }
}

export function applyPending(
  members: GroupMember[],
  p: PendingChanges
): ShownMember[] {
  const removed = new Set(p.removed)
  const shown: ShownMember[] = members
    .filter((m) => !(m.email && removed.has(m.email)))
    .map((m) => ({ ...m, pending: false }))
  const present = new Set(members.map((m) => m.email))
  for (const email of p.added) {
    if (present.has(email)) continue
    shown.push({
      id: null,
      email,
      role: "MEMBER",
      type: null,
      status: null,
      pending: true,
    })
  }
  return shown
}

/** Drop the entries Google's list now agrees with. Same object if none. */
export function prunePending(
  members: GroupMember[],
  p: PendingChanges
): PendingChanges {
  const present = new Set(members.map((m) => m.email))
  const added = p.added.filter((e) => !present.has(e))
  const removed = p.removed.filter((e) => present.has(e))
  return added.length === p.added.length && removed.length === p.removed.length
    ? p
    : { added, removed }
}

/**
 * The re-reads have run out and the overlay is still there. With a good
 * list on screen Google has had its window, so the overlay goes ("clear").
 * With the latest read failed, the list is the last good one and says
 * nothing about the changes since: clearing would make a confirmed removal
 * reappear and a confirmed add vanish, so the overlay stays ("defer") until
 * a read succeeds.
 */
export function onRetriesExhausted(stale: boolean): "clear" | "defer" {
  return stale ? "defer" : "clear"
}

/**
 * A new list arrived from the server. Normally it settles what it agrees
 * with. If the give-up was deferred, this is the first good read since: it
 * has had its window, so whatever it still disagrees with is dropped too
 * (an address Google lists under another spelling must not read "同步中"
 * forever). A list that is itself stale settles nothing beyond pruning.
 */
export function onFreshList(
  members: GroupMember[],
  p: PendingChanges,
  state: { giveUpDeferred: boolean; stale: boolean }
): PendingChanges {
  if (state.giveUpDeferred && !state.stale) return NO_PENDING
  return prunePending(members, p)
}
