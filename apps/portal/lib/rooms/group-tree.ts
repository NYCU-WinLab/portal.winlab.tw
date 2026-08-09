// Pure decision: given a group's inline `subGroups` field, do we trust it or
// do we have to go ask /children?
//
// Extracted so it can be tested without a Keycloak. It exists because the
// obvious `group.subGroups ?? fetchChildren()` is wrong on Keycloak 23+,
// which sends an empty array rather than omitting the field — so the
// nullish-coalescing never fell through and /children was never called,
// leaving a realm full of subgroups reported as having none.

export interface InlineSubGroups {
  subGroups?: unknown[]
}

export function needsChildrenFetch(group: InlineSubGroups): boolean {
  return !group.subGroups || group.subGroups.length === 0
}
