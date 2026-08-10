/** Toast title after pinning or unpinning a wall photo. */
export function describePinToast(pinned: boolean): string {
  return pinned ? "Pinned to wall top." : "Unpinned."
}
