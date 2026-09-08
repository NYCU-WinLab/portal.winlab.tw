/** Muted Memories chrome hint for the T-today shortcut. */
export function describeMemoriesTodayShortcutHint(
  viewingToday: boolean
): string | null {
  if (viewingToday) return null
  return "Press T to jump back to today."
}
