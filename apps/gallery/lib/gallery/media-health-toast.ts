/** Toast after a media-health scan finishes with zero findings. */
export function describeMediaHealthAllHealthy(scanned: number): string {
  return `Scanned ${scanned} shot${scanned === 1 ? "" : "s"} — all healthy.`
}

/** Toast after a media-health scan finds broken shots. */
export function describeMediaHealthFoundBroken(input: {
  broken: number
  scanned: number
}): string {
  const { broken, scanned } = input
  return `Found ${broken} broken shot${broken === 1 ? "" : "s"} across ${scanned}.`
}

/** Toast after deleting broken shots from media health. */
export function describeMediaHealthDeleted(deleted: number): string {
  return `Removed ${deleted} broken shot${deleted === 1 ? "" : "s"} from the wall.`
}

/** Busy label while a destructive delete is in flight. */
export function describeDeletingLabel(): string {
  return "Deleting…"
}

/** Idle label for permanent delete actions. */
export function describeDeleteForeverLabel(): string {
  return "Delete forever"
}
