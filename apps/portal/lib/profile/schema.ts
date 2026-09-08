// The Keycloak account fields /profile shows a member about themselves.
//
// This used to be a write whitelist — the security boundary between "the user
// typed something in a form" and "we PUT it into Keycloak". The portal no
// longer writes to Keycloak at all: editing happens in Keycloak's own Account
// Console, which enforces the realm's per-attribute permissions itself. So the
// validators that lived here are gone, and this is now just a display order.
//
// It is still a whitelist in one sense worth keeping: a member's Keycloak
// representation carries more than this, and only these are shown.
//
// [班別1][入學學年2][系所3][流水號3] — e.g. 313552013 is 113 級. That structure
// is what lib/meetings/admission-year.ts reads to derive a cohort.

export const PROFILE_FIELDS = [
  "chinese_name",
  "firstName",
  "lastName",
  "phone",
  "position",
  "gitlabUsername",
  "student_id",
] as const

export type ProfileField = (typeof PROFILE_FIELDS)[number]
