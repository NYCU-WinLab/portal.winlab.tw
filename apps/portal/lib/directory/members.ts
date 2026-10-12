export type MemberRole =
  | "professor"
  | "phd"
  | "master"
  | "undergraduate"
  | "alumni"
  | "staff"
  | "pending"

export type DirectoryMember = {
  id: string
  name: string
  nameEn: string
  email: string
  phone?: string
  role: MemberRole
  position?: string
  github?: string
  office?: string
  researchAreas: string[]
  admissionYear?: string
  studentId?: string
}

export const ROLE_LABELS: Record<MemberRole, string> = {
  professor: "教授",
  phd: "博士生",
  master: "碩士生",
  undergraduate: "大學生",
  alumni: "校友",
  staff: "行政人員",
  pending: "待確認",
}

export const ROLE_ORDER: MemberRole[] = [
  "professor",
  "phd",
  "master",
  "undergraduate",
  "staff",
  "alumni",
  "pending",
]

/**
 * Keycloak's `role` attribute has no validation, so any string can arrive.
 * Unrecognised values become "pending" (待確認) rather than being asserted
 * through an `as MemberRole` cast — a visible degradation instead of a row
 * that vanishes from the directory. Cleaning up bad data doesn't retire this:
 * one stray leading space brings it back.
 *
 * Checked against ROLE_LABELS because only that is a Record<MemberRole, …> the
 * compiler keeps exhaustive — ROLE_ORDER can silently lag a newly added role.
 * `Object.hasOwn`, not `in`, so a role named "toString" can't match via the
 * prototype chain.
 *
 * Offending values go into `unrecognised` for the caller to report once per
 * refresh. Coercing in silence would leave a malformed attribute
 * indistinguishable from a member whose role genuinely hasn't been assigned —
 * both render as 待確認 — so nobody would ever be told to go fix the data.
 */
export function toMemberRole(
  value: string | undefined,
  userId: string,
  unrecognised: Map<string, string>
): MemberRole {
  if (value && Object.hasOwn(ROLE_LABELS, value)) {
    return value as MemberRole
  }
  if (value) {
    unrecognised.set(userId, value)
  }
  return "pending"
}

export type DirectoryUser = {
  id: string
  username?: string
  enabled?: boolean
  email?: string
  firstName?: string
  lastName?: string
  attributes?: Record<string, string[]>
}

// Preserve the website's roster: enabled people, excluding test accounts.
export function isListed(user: DirectoryUser): boolean {
  return (
    Boolean(user.enabled) &&
    !/(^|[-_.])test([-_.]|$)/i.test(user.username ?? "")
  )
}

export function toDirectoryMember(
  user: DirectoryUser,
  unrecognised: Map<string, string>
): DirectoryMember {
  const attrs = user.attributes ?? {}
  return {
    id: user.id,
    name: attrs.chinese_name?.[0] ?? user.username ?? "",
    nameEn: [user.firstName, user.lastName].filter(Boolean).join(" "),
    email: user.email ?? "",
    phone: attrs.phone?.[0],
    role: toMemberRole(attrs.role?.[0], user.id, unrecognised),
    position: attrs.position?.[0],
    github: attrs.github?.[0],
    office: attrs.office?.[0],
    researchAreas: attrs.research_areas ?? [],
    admissionYear: attrs.admissionYear?.[0],
    studentId: attrs.student_id?.[0],
  }
}
