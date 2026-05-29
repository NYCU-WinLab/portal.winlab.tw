/**
 * Returns the registered signer ids that no longer back any field — the
 * orphaned `approve_signers` rows that syncSigners should prune. Set-diff:
 * registered minus still-in-use.
 */
export function computeOrphanedSigners(
  fieldSignerIds: string[],
  registeredSignerIds: string[]
): string[] {
  const stillUsed = new Set(fieldSignerIds)
  return registeredSignerIds.filter((id) => !stillUsed.has(id))
}
