// The OAuth scopes the portal-groups token is minted with. Kept apart from
// google-auth.ts (server-only) so a test can pin them: widening these to the
// full group scope would let the credential change group settings, which the
// custom admin role is deliberately unable to do.

export const SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group.readonly",
  "https://www.googleapis.com/auth/admin.directory.group.member",
]
