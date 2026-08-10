/** Toast title after pinning or unpinning a wall photo. */
export function describePinToast(pinned: boolean): string {
  return pinned ? "Pinned to wall top." : "Unpinned."
}

/** Idle Pin control label. */
export function describePinLabel(): string {
  return "Pin"
}

/** Idle Unpin control label. */
export function describeUnpinLabel(): string {
  return "Unpin"
}

/** Pin / Unpin chrome label from current pinned state. */
export function describePinChromeLabel(pinned: boolean): string {
  return pinned ? describeUnpinLabel() : describePinLabel()
}
