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
): { emails: string[]; skippedNoEmail: number; skippedAlumni: number } {
  const emails: string[] = []
  let skippedNoEmail = 0
  let skippedAlumni = 0
  for (const m of members) {
    const email = m.email ? normalizeEmail(m.email) : null
    if (!email) {
      skippedNoEmail++
      continue
    }
    if (opts.excludeAlumni && statusByEmail.get(email) === "alumni") {
      skippedAlumni++
      continue
    }
    if (!emails.includes(email)) emails.push(email)
  }
  return { emails, skippedNoEmail, skippedAlumni }
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
