/** Toast title after bulk-setting capture dates on Manage selection. */
export function describeBulkTakenAtSet(updated: number): string {
  return `Set capture date on ${updated} work${updated === 1 ? "" : "s"}.`
}
